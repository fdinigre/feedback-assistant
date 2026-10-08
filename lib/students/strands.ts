import "server-only";

import { listDescriptorChecks, listRubricDescriptors } from "@/lib/db/queries";
import { listGradedSubmissions } from "@/lib/students/shared";
import type { LevelBand } from "@/lib/types";

/**
 * Where a student stands against the rubric, across every task that was marked
 * against descriptors rather than only the latest one.
 *
 * met_final is the teacher's judgement and met_proposed is the tool's, and almost
 * every check on file is still an unreviewed proposal. A tick list that quietly
 * promoted those to fact would assert more than anybody has decided, so what is
 * still the tool's alone is carried through, paper by paper, to be linked.
 */

/** A paper with rubric statements still standing on the tool's judgement alone. */
export type UnreviewedRubric = {
  submissionId: number;
  assessmentTitle: string;
  /** The first criterion with an unreviewed statement: where the link lands. */
  criterion: string;
  count: number;
};

const BAND_ORDER: LevelBand[] = ["1-2", "3-4", "5-6", "7-8"];

/**
 * Every paper whose rubric statements include one nobody has ticked, with how
 * many. met_final is the teacher's judgement and met_proposed the tool's; almost
 * every check on file is still a proposal, and a brief that quietly promoted
 * those to fact would assert more than anybody has decided. Per paper, so the
 * warning can say which one to open.
 */
export function listUnreviewedRubric(studentId: number): UnreviewedRubric[] {
  const out: UnreviewedRubric[] = [];
  for (const { assessment, submission } of listGradedSubmissions(studentId)) {
    const descriptors = new Map(listRubricDescriptors(assessment.id).map((d) => [d.id, d]));
    if (descriptors.size === 0) continue;
    let count = 0;
    let criterion: string | null = null;
    for (const check of listDescriptorChecks(submission.id)) {
      if (check.met_final !== null || check.met_proposed === null) continue;
      const descriptor = descriptors.get(check.descriptor_id);
      if (!descriptor) continue;
      count += 1;
      criterion ??= descriptor.criterion;
    }
    if (count > 0 && criterion) {
      out.push({ submissionId: submission.id, assessmentTitle: assessment.title, criterion, count });
    }
  }
  return out;
}

/**
 * Short names for the MYP mathematics strands, so a strand reads the same on
 * every task that assesses it. The official descriptor changes wording from band
 * to band ("suggest general rules" at 3-4, "describe patterns as general rules"
 * at 5-6); the strand is what stays put, and it is what the next task will ask
 * for again.
 */
const STRAND_NAMES: Record<string, string> = {
  "A|i": "Selecting the right mathematics",
  "A|ii": "Applying the mathematics successfully",
  "A|iii": "Solving problems correctly in different contexts",
  "B|i": "Finding patterns with problem-solving techniques",
  "B|ii": "Describing patterns as general rules",
  "B|iii": "Verifying and justifying general rules",
  "C|i": "Using mathematical language and notation",
  "C|ii": "Using appropriate forms of representation",
  "C|iii": "Moving between forms of representation",
  "C|iv": "Communicating a complete line of reasoning",
  "C|v": "Organising work in a logical structure",
  "D|i": "Identifying what matters in a real-life situation",
  "D|ii": "Choosing a mathematical strategy",
  "D|iii": "Applying the strategy to reach a solution",
  "D|iv": "Justifying the degree of accuracy",
  "D|v": "Judging whether the answer makes sense in context",
};

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi"];

/** The official descriptor as a clause: trimmed, capitalised, no closing full stop. */
function asClause(text: string): string {
  const t = text.trim().replace(/\.$/, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export type StrandProgress = {
  criterion: string;
  strand: string | null;
  /** The strand's short name, the same on every task that assesses it. */
  name: string;
  /** The highest band with a statement met at least once, on any task. */
  reachedBand: LevelBand | null;
  /** What they did at that band, in the task's own words: evidence, not a target. */
  reached: { text: string; assessmentTitle: string }[];
  /** The lowest band above that which a task has judged them on and not met. */
  nextBand: LevelBand | null;
  /**
   * The official descriptor at that band. Unlike the task's own wording ("the
   * figure that gives a difference of 75"), this is what any later task
   * assessing the strand will ask for.
   */
  nextDescriptor: string | null;
  /** Every task that judged this strand. */
  assessmentTitles: string[];
  /** Papers where a judgement on this strand is still the tool's alone — each one a link. */
  unreviewed: { submissionId: number; assessmentTitle: string }[];
};

/**
 * Where a student stands on each rubric strand across every task marked against
 * descriptors. The statement-by-statement view above is right for one paper;
 * across a year it is a list of one-off wordings, most of which no later task
 * will print again. The strand is what recurs, so this is what to aim at.
 */
export function computeStrandProgress(studentId: number): StrandProgress[] {
  type Band = { judged: number; met: number; official: string; examples: { text: string; assessmentTitle: string }[] };
  type Group = {
    criterion: string;
    strand: string | null;
    bands: Map<LevelBand, Band>;
    titles: Set<string>;
    unreviewed: Map<number, string>;
  };
  const groups = new Map<string, Group>();

  for (const { assessment, submission } of listGradedSubmissions(studentId)) {
    const descriptors = listRubricDescriptors(assessment.id);
    if (descriptors.length === 0) continue;
    const checks = new Map(listDescriptorChecks(submission.id).map((c) => [c.descriptor_id, c]));
    for (const descriptor of descriptors) {
      const check = checks.get(descriptor.id);
      if (!check) continue;
      const met = check.met_final ?? check.met_proposed;
      if (met === null) continue;

      // Without a strand label there is no ladder to climb, so the official
      // statement is its own strand.
      const key = descriptor.strand
        ? `${descriptor.criterion}|${descriptor.strand}`
        : `${descriptor.criterion}|_|${descriptor.text.trim().toLowerCase()}`;
      const group = groups.get(key) ?? {
        criterion: descriptor.criterion,
        strand: descriptor.strand,
        bands: new Map<LevelBand, Band>(),
        titles: new Set<string>(),
        unreviewed: new Map<number, string>(),
      };
      const band = group.bands.get(descriptor.band) ?? {
        judged: 0,
        met: 0,
        official: asClause(descriptor.text),
        examples: [],
      };
      band.judged += 1;
      if (met === 1) {
        band.met += 1;
        band.examples.push({
          text: descriptor.student_text ?? asClause(descriptor.text),
          assessmentTitle: assessment.title,
        });
      }
      group.bands.set(descriptor.band, band);
      group.titles.add(assessment.title);
      if (check.met_final === null) group.unreviewed.set(submission.id, assessment.title);
      groups.set(key, group);
    }
  }

  const out: StrandProgress[] = [];
  for (const group of groups.values()) {
    const judgedBands = BAND_ORDER.filter((b) => group.bands.has(b));
    // Met at least once counts as reached: the student did it on the day, even
    // if a later task asked the same thing again and they did not.
    const reachedBand = [...judgedBands].reverse().find((b) => group.bands.get(b)!.met > 0) ?? null;
    const nextBand =
      judgedBands.find(
        (b) =>
          group.bands.get(b)!.met < group.bands.get(b)!.judged &&
          (reachedBand === null || BAND_ORDER.indexOf(b) > BAND_ORDER.indexOf(reachedBand))
      ) ?? null;
    const lowest = group.bands.get(judgedBands[0])!;
    out.push({
      criterion: group.criterion,
      strand: group.strand,
      name:
        (group.strand && STRAND_NAMES[`${group.criterion}|${group.strand.toLowerCase()}`]) ??
        lowest.official,
      reachedBand,
      reached: reachedBand ? group.bands.get(reachedBand)!.examples : [],
      nextBand,
      nextDescriptor: nextBand ? group.bands.get(nextBand)!.official : null,
      assessmentTitles: [...group.titles],
      unreviewed: [...group.unreviewed].map(([submissionId, assessmentTitle]) => ({
        submissionId,
        assessmentTitle,
      })),
    });
  }

  const romanIndex = (s: string | null) => (s ? ROMAN.indexOf(s.toLowerCase()) : 99);
  return out.sort(
    (a, b) =>
      a.criterion.localeCompare(b.criterion) ||
      romanIndex(a.strand) - romanIndex(b.strand) ||
      a.name.localeCompare(b.name)
  );
}
