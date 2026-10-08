import "server-only";

import {
  getReport,
  hasErrorTags,
  hasSkillTags,
  listQuestions,
  listSkillTags,
  listTranscripts,
} from "@/lib/db/queries";
import { injectNameSections } from "@/lib/render/names";
import { listGradedSubmissions } from "@/lib/students/shared";
import { computeMastery } from "@/lib/students/mastery";
import { listErrorTags } from "@/lib/db/queries";
import { MECHANISM_BY_ID } from "@/lib/errors/taxonomy";
import { CORE_SKILL_BY_ID } from "@/lib/errors/core-skills";
import type { LevelBand, StudentRow } from "@/lib/types";

export type AreaBullet = {
  text: string;
  assessmentTitle: string;
  reportStatus: "approved" | "draft";
};

/**
 * All areasForImprovement bullets across this student's APPROVED reports, each
 * labelled with the assessment it came from.
 *
 * Drafts are left out rather than labelled: a draft is something the tool wrote
 * that nobody has agreed with yet, and mixing the two under one heading made
 * every bullet carry a status pill that was "approved" almost every time.
 */
export function computeAreasForImprovement(studentId: number, student: StudentRow): AreaBullet[] {
  const graded = listGradedSubmissions(studentId);
  const bullets: AreaBullet[] = [];

  for (const { assessment, submission } of graded) {
    const report = getReport(submission.id);
    if (!report || report.status !== "approved") continue;
    const sections = injectNameSections(report.sections, student.name, student.pseudonym);
    for (const text of sections.areasForImprovement) {
      bullets.push({ text, assessmentTitle: assessment.title, reportStatus: report.status });
    }
  }

  return bullets;
}

/**
 * A learning target that has come up weak on more than one task.
 *
 * Measured by identity — the same target examined twice — not by looking for
 * similar sentences in the reports, which would assert patterns that are really
 * two ways of saying different things. Rubric strands, mistake kinds and core
 * skills used to be counted here too; each now has its own section, measured
 * the same way.
 */
export type Recurrence = {
  kind: "target";
  text: string;
  detail: string;
  /** How many separate pieces of work it has shown up on. */
  occurrences: number;
};

const WEAK_PCT = 70;
const MIN_TARGET_MARKS = 4;

export function computeRecurrences(studentId: number): Recurrence[] {
  const out: Recurrence[] = [];

  for (const row of computeMastery(studentId)) {
    if (row.assessmentTitles.length < 2) continue;
    if (row.max < MIN_TARGET_MARKS || row.pct >= WEAK_PCT) continue;
    out.push({
      kind: "target",
      text: row.name,
      detail: `${row.earned} of ${row.max} marks across ${row.questionCount} question${
        row.questionCount === 1 ? "" : "s"
      } · ${row.assessmentTitles.join(", ")}`,
      occurrences: row.assessmentTitles.length,
    });
  }

  return out.sort((a, b) => b.occurrences - a.occurrences || a.text.localeCompare(b.text));
}

export type CommonMistake = {
  text: string;
  about: "maths" | "question";
  /** Questions it was tagged on, across every graded piece of work. */
  questions: number;
  assessmentTitles: string[];
  /** The marking phrases behind the count, so it can always be checked. */
  quotes: string[];
  /** The task it was last seen on. */
  lastSeen: string;
  /** Sorted papers since then without it: one or more and the habit may have stopped. */
  papersSince: number;
};

/**
 * Per tag key: how often, on which tasks, and how many sorted papers have come
 * since it was last seen. A habit that has stopped is worth saying as much as
 * one that has not — but absence only counts on a paper that was sorted, since
 * an unsorted paper cannot show a mistake either way.
 */
function tallyTags(
  studentId: number,
  tagsOf: (submissionId: number) => { key: string; quote: string }[],
  sorted: (submissionId: number) => boolean
) {
  const papers = listGradedSubmissions(studentId); // oldest first
  const wasSorted = papers.map((p) => sorted(p.submission.id));
  const tallies = new Map<
    string,
    { questions: number; titles: string[]; quotes: string[]; lastIndex: number; lastSeen: string }
  >();
  papers.forEach(({ assessment, submission }, index) => {
    for (const tag of tagsOf(submission.id)) {
      const entry = tallies.get(tag.key) ?? { questions: 0, titles: [], quotes: [], lastIndex: 0, lastSeen: "" };
      entry.questions += 1;
      if (!entry.titles.includes(assessment.title)) entry.titles.push(assessment.title);
      if (tag.quote) entry.quotes.push(tag.quote);
      entry.lastIndex = index;
      entry.lastSeen = assessment.title;
      tallies.set(tag.key, entry);
    }
  });
  const papersSince = (lastIndex: number) => wasSorted.slice(lastIndex + 1).filter(Boolean).length;
  return { tallies, papersSince };
}

/**
 * The kinds of mistake that come up most, short enough to read out to a parent.
 * Counted by question, not by paper as computeRecurrences is: a student with a
 * single graded paper still has habits on it, and the same slip on three of its
 * questions is one. Twice is the bar; once is a slip.
 *
 * The top few of each side, rather than overall: method slips are tagged far
 * more often, and would otherwise crowd out a command-term habit that is just as
 * worth raising.
 */
export function computeCommonMistakes(studentId: number, perSide = 3): CommonMistake[] {
  const { tallies, papersSince } = tallyTags(
    studentId,
    (id) => listErrorTags(id).map((t) => ({ key: t.mechanism, quote: t.quote })),
    hasErrorTags
  );
  const out: CommonMistake[] = [];
  for (const [id, entry] of tallies) {
    const mechanism = MECHANISM_BY_ID.get(id);
    if (!mechanism || entry.questions < 2) continue;
    out.push({
      text: mechanism.name,
      about: mechanism.about,
      questions: entry.questions,
      assessmentTitles: entry.titles,
      quotes: entry.quotes.slice(0, 4),
      lastSeen: entry.lastSeen,
      papersSince: papersSince(entry.lastIndex),
    });
  }
  out.sort(
    (a, b) =>
      b.questions - a.questions ||
      b.assessmentTitles.length - a.assessmentTitles.length ||
      a.text.localeCompare(b.text)
  );
  return [
    ...out.filter((m) => m.about === "maths").slice(0, perSide),
    ...out.filter((m) => m.about === "question").slice(0, perSide),
  ];
}

/**
 * Questions left unattempted, and where they fall. Kept out of the mechanism
 * list — a blank is not a mistake of method — but kept, because blanks bunched
 * in the hardest band is a pacing story worth telling.
 */
export type UnattemptedSignal = {
  total: number;
  byBand: Record<LevelBand, number>;
  /** True when more than half of them sit in the top two bands. */
  concentratedInHardest: boolean;
};

export function computeUnattempted(studentId: number): UnattemptedSignal {
  const byBand: Record<LevelBand, number> = { "1-2": 0, "3-4": 0, "5-6": 0, "7-8": 0 };
  for (const { assessment, submission } of listGradedSubmissions(studentId)) {
    const questionById = new Map(listQuestions(assessment.id).map((q) => [q.id, q]));
    for (const transcript of listTranscripts(submission.id)) {
      if (!transcript.content.blank) continue;
      const question = questionById.get(transcript.question_id);
      if (!question || !question.level_band) continue; // DP questions have no MYP level band
      byBand[question.level_band] += 1;
    }
  }
  const total = (Object.values(byBand) as number[]).reduce((a, b) => a + b, 0);
  const hardest = byBand["5-6"] + byBand["7-8"];
  return { total, byBand, concentratedInHardest: total > 0 && hardest > total / 2 };
}

export type CoreSkillStanding = {
  id: string;
  name: string;
  /** Questions it cost marks on, across every graded piece of work. */
  questions: number;
  /** The tasks it showed up on, oldest first. More than one is the point. */
  assessmentTitles: string[];
  /** The marking phrases behind the count, so it can always be checked. */
  quotes: string[];
  /** The task it was last seen on. */
  lastSeen: string;
  /** Sorted papers since then without it. */
  papersSince: number;
};

/**
 * The core skills that have cost marks, across every unit. Ranked by how many
 * different tasks a skill broke down on before how many questions: three slips
 * with fractions in three units says more about the year than five on one paper.
 */
export function computeCoreSkills(studentId: number): CoreSkillStanding[] {
  const { tallies, papersSince } = tallyTags(
    studentId,
    (id) => listSkillTags(id).map((t) => ({ key: t.skill, quote: t.quote })),
    hasSkillTags
  );
  const out: CoreSkillStanding[] = [];
  for (const [id, entry] of tallies) {
    const skill = CORE_SKILL_BY_ID.get(id);
    if (!skill) continue;
    out.push({
      id,
      name: skill.name,
      questions: entry.questions,
      assessmentTitles: entry.titles,
      quotes: entry.quotes.slice(0, 4),
      lastSeen: entry.lastSeen,
      papersSince: papersSince(entry.lastIndex),
    });
  }
  return out.sort(
    (a, b) =>
      b.assessmentTitles.length - a.assessmentTitles.length ||
      b.questions - a.questions ||
      a.name.localeCompare(b.name)
  );
}
