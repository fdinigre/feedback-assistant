import "server-only";

import { getReport, getStudent, getClass, listClassPlanEntries } from "@/lib/db/queries";
import { injectNameSections } from "@/lib/render/names";
import { listGradedSubmissions } from "@/lib/students/shared";
import {
  computeCriterionHistory,
  type CriterionHistory,
  type CriterionHistoryResult,
  type OtherGrade,
  type PriorFinalGrade,
  type PriorLevel,
  type TrendArrow,
} from "@/lib/students/criterion-history";
import { isBeforeSemester, previousSemester, semesterOf } from "@/lib/students/semester";
import { computeMastery } from "@/lib/students/mastery";
import { computeCommonMistakes, type CommonMistake } from "@/lib/students/patterns";
import {
  computeStrandProgress,
  listUnreviewedRubric,
  type StrandProgress,
  type UnreviewedRubric,
} from "@/lib/students/strands";
import type { ClassPlanEntryRow, ReportStatus, StudentRow } from "@/lib/types";

/**
 * Everything to say about one student in a parent conference, assembled from what
 * is already on file — no AI, nothing generated here that the teacher has not
 * already read and approved somewhere else.
 *
 * The hard part is length, not data. A student with four reports carries forty
 * bullets of second-person prose, which is five printed pages nobody reads in a
 * ten-minute meeting. So this takes the LATEST report only and caps what it
 * shows, counting what it left behind rather than hiding it.
 */

const MAX_BULLETS = 4;
/** A learning target worth naming: anything thinner is one question, not a pattern. */
const MIN_TARGET_MARKS = 4;
const UPCOMING_DAYS = 21;

export type { CriterionHistory, OtherGrade, PriorFinalGrade };

export type BriefBullets = {
  assessmentTitle: string;
  /** The paper the report belongs to, so "still a draft" can open it. */
  submissionId: number;
  status: ReportStatus;
  shown: string[];
  /** How many more the report holds, so a short list never looks like the whole story. */
  more: number;
};

export type WeakTarget = {
  name: string;
  earned: number;
  max: number;
  questionCount: number;
  /** Which tasks it has been examined on — two or more makes it a recurring skill. */
  assessmentTitles: string[];
};

/**
 * Something to resolve before the meeting rather than during it. Everything here
 * is already known to the app; the point is that a brief read aloud to a parent
 * should not quietly turn an unreviewed proposal into a fact.
 */
export type SettleItem = {
  kind: "provisional-level" | "draft-report" | "unreviewed-strands";
  text: string;
  href: string;
};

/**
 * The semester before this one, as this app marked it: for when the school's
 * own record of it has not been imported. Shaped like an imported year card.
 */
export type MarkedSemester = {
  label: string;
  finalGrade: null;
  criteria: { criterion: string; level: number }[];
  assessments: { label: string; grade: number; pct: number | null; href?: string }[];
  notes: { label: string; value: string }[];
};

export type ConferenceBrief = {
  student: StudentRow;
  className: string;
  /** The semester the conference falls in, e.g. "2026-27 S2". Everything above "Before this semester" is from it. */
  semester: string;
  /** The one before, which the comparisons are against wherever it is on file. */
  previousSemester: string;
  /** MYP: one row per criterion assessed this semester, each level in date order. */
  criteria: CriterionHistory[];
  /** DP grades and points-only tests from this semester, which do not pivot by criterion. */
  otherGrades: OtherGrade[];
  /** DP final grades from earlier semesters, for a course that spans grades 11 and 12. */
  priorFinalGrades: PriorFinalGrade[];
  /** The record the trend arrows compare against, e.g. "2026-27 S1". */
  priorPeriod: string | null;
  /** The previous semester from this app's own marking, when there is any. */
  previousFromMarking: MarkedSemester | null;
  strengths: BriefBullets | null;
  areas: BriefBullets | null;
  nextSteps: BriefBullets | null;
  /**
   * Each rubric strand across every task judged against descriptors: the band
   * reached, in the task's own words, and the next band as the official
   * descriptor, which is what a later task will ask for.
   */
  strands: StrandProgress[];
  weakTargets: WeakTarget[];
  /**
   * Weak skills that have already been examined on more than one task. A skill
   * that keeps coming back is worth a habit at home; one bad question is not.
   */
  recurringSkills: WeakTarget[];
  /** The kinds of mistake that come up most, from the tags on the student's papers. */
  commonMistakes: CommonMistake[];
  /** Teacher-only: what is still unsettled in the data behind this brief. */
  settleFirst: SettleItem[];
  comingUp: ClassPlanEntryRow[];
  /** Criteria an upcoming task assesses, paired with where this student stands. */
  focus: { criterion: string; level: number | null; when: string; what: string }[];
};

function takeBullets(
  all: string[],
  report: { assessmentTitle: string; submissionId: number; status: ReportStatus }
): BriefBullets | null {
  if (all.length === 0) return null;
  return {
    assessmentTitle: report.assessmentTitle,
    submissionId: report.submissionId,
    status: report.status,
    shown: all.slice(0, MAX_BULLETS),
    more: Math.max(0, all.length - MAX_BULLETS),
  };
}

/** The most recent report of any status — a draft still says more than an empty box. */
function latestReport(studentId: number, student: StudentRow) {
  const graded = listGradedSubmissions(studentId); // oldest -> newest
  for (let i = graded.length - 1; i >= 0; i--) {
    const { assessment, submission } = graded[i];
    const report = getReport(submission.id);
    if (!report) continue;
    return {
      assessmentTitle: assessment.title,
      submissionId: submission.id,
      status: report.status,
      sections: injectNameSections(report.sections, student.name, student.pseudonym),
    };
  }
  return null;
}

function trendOf(latest: number, baseline: number | null): TrendArrow | null {
  if (baseline == null) return null;
  return latest > baseline ? "up" : latest < baseline ? "down" : "same";
}

/**
 * A conference is about this semester. Only this semester's work goes in the
 * top sections, and the comparisons are against the semester before: its record
 * as the school reported it where that has been imported, and otherwise where
 * this app's own marking left the student at the end of it. Earlier records stay
 * underneath, and the student page keeps the whole year.
 */
function scopeToSemester(history: CriterionHistoryResult, semester: string) {
  const previous = previousSemester(semester);
  const schoolYear = previous.slice(0, 7);

  const criteria: CriterionHistory[] = [];
  for (const c of history.criteria) {
    const points = c.points.filter((p) => p.semester === semester);
    if (points.length === 0) continue;
    const before = c.prior.filter((p) => isBeforeSemester(p.period, semester));
    const lastPrevious = c.points.filter((p) => p.semester === previous).at(-1);
    const prior: PriorLevel[] =
      lastPrevious && !before.some((p) => p.period === previous)
        ? [...before, { period: previous, schoolYear, level: lastPrevious.level }]
        : before;
    const trend = trendOf(points[points.length - 1].level, prior.at(-1)?.level ?? null);
    criteria.push({ criterion: c.criterion, points, trend, prior });
  }

  const otherGrades = history.otherGrades.filter((g) => g.semester === semester);
  const lastPreviousDp = history.otherGrades
    .filter((g) => g.semester === previous)
    .map((g) => g.grade)
    .filter((g) => g.kind === "dp")
    .at(-1);
  const finalsBefore = history.priorFinalGrades.filter((g) => isBeforeSemester(g.period, semester));
  const priorFinalGrades: PriorFinalGrade[] =
    lastPreviousDp && !finalsBefore.some((g) => g.period === previous)
      ? [...finalsBefore, { period: previous, schoolYear, grade: lastPreviousDp.grade, fromMarking: true }]
      : finalsBefore;

  // The period the comparisons are against: the previous semester wherever
  // anything from it is on file, else the latest earlier record.
  const baselines = [
    ...criteria.map((c) => c.prior.at(-1)?.period),
    priorFinalGrades.at(-1)?.period,
  ].filter((p): p is string => !!p);
  const priorPeriod = baselines.includes(previous)
    ? previous
    : ([...baselines].sort((a, b) => (isBeforeSemester(a, b) ? -1 : 1)).at(-1) ?? null);

  const markedCriteria = history.criteria.flatMap((c) => {
    const last = c.points.filter((p) => p.semester === previous).at(-1);
    return last ? [{ criterion: c.criterion, level: last.level }] : [];
  });
  const markedTasks = history.otherGrades.flatMap((g) =>
    g.semester === previous && g.grade.kind === "dp"
      ? [
          {
            label: g.assessmentTitle,
            grade: g.grade.grade,
            pct: Math.round(g.grade.pct),
            href: `/submissions/${g.submissionId}`,
          },
        ]
      : []
  );
  const previousFromMarking: MarkedSemester | null =
    markedCriteria.length > 0 || markedTasks.length > 0
      ? {
          label: previous,
          finalGrade: null,
          criteria: markedCriteria,
          assessments: markedTasks,
          notes: [{ label: "Source", value: "From the marking in this app, not a grade the school reported" }],
        }
      : null;

  return { criteria, otherGrades, priorFinalGrades, priorPeriod, previousFromMarking };
}

/**
 * The data behind this brief that nobody has signed off on yet. Each of these is
 * shown to the teacher and never to the parent, because the honest fix is to go
 * and settle it rather than to caveat it out loud mid-meeting.
 */
function buildSettleFirst(
  criteria: CriterionHistory[],
  report: { assessmentTitle: string; submissionId: number; status: ReportStatus } | null,
  unreviewedRubric: UnreviewedRubric[]
): SettleItem[] {
  const items: SettleItem[] = [];

  for (const criterion of criteria) {
    const latest = criterion.points[criterion.points.length - 1];
    if (!latest?.provisional) continue;
    items.push({
      kind: "provisional-level",
      text: `Criterion ${criterion.criterion} is still the tool's cautious reading — ${latest.level} on ${latest.assessmentTitle}, with no review behind it.`,
      href: `/submissions/${latest.submissionId}#criterion-${criterion.criterion}`,
    });
  }

  if (report?.status === "draft") {
    items.push({
      kind: "draft-report",
      text: `The report for ${report.assessmentTitle} is still a draft, and everything quoted below comes from it.`,
      href: `/submissions/${report.submissionId}#report`,
    });
  }

  // One line per paper, so each says which paper to open.
  for (const paper of unreviewedRubric) {
    items.push({
      kind: "unreviewed-strands",
      text: `${paper.count} rubric statement${paper.count === 1 ? "" : "s"} on ${paper.assessmentTitle} ${
        paper.count === 1 ? "is" : "are"
      } still the tool's judgement — tick them off on the paper and they stop being provisional.`,
      href: `/submissions/${paper.submissionId}#criterion-${paper.criterion}`,
    });
  }

  return items;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/**
 * Builds the brief. `from` is the day the conference is held — she prints the pack
 * days ahead, so "coming up" cannot mean "today" in the general case.
 */
export function buildConferenceBrief(studentId: number, from: string): ConferenceBrief | null {
  const student = getStudent(studentId);
  if (!student) return null;
  const cls = getClass(student.class_id);

  const semester = semesterOf(from);
  const { criteria, otherGrades, priorFinalGrades, priorPeriod, previousFromMarking } = scopeToSemester(
    computeCriterionHistory(studentId),
    semester
  );
  const report = latestReport(studentId, student);
  const unreviewedRubric = listUnreviewedRubric(studentId);
  const strands = computeStrandProgress(studentId);

  const comingUp = listClassPlanEntries(student.class_id, from).filter(
    (entry) => entry.date <= addDays(from, UPCOMING_DAYS)
  );

  // What those upcoming tasks assess, against where this student currently stands.
  const latestByCriterion = new Map(
    criteria.map((c) => [c.criterion, c.points[c.points.length - 1]?.level ?? null])
  );
  const focus: ConferenceBrief["focus"] = [];
  const seen = new Set<string>();
  for (const entry of comingUp) {
    for (const criterion of entry.criteria) {
      if (seen.has(criterion)) continue;
      seen.add(criterion);
      focus.push({
        criterion,
        level: latestByCriterion.get(criterion) ?? null,
        when: entry.date,
        what: entry.topic,
      });
    }
  }

  // A target worth naming has enough marks behind it to mean something; "0%" on a
  // single one-mark question is one question, not a weakness.
  const weak: WeakTarget[] = computeMastery(studentId)
    .filter((row) => row.max >= MIN_TARGET_MARKS && row.pct < 70)
    .map((row) => ({
      name: row.name,
      earned: row.earned,
      max: row.max,
      questionCount: row.questionCount,
      assessmentTitles: row.assessmentTitles,
    }));

  return {
    student,
    className: cls?.name ?? "",
    semester,
    previousSemester: previousSemester(semester),
    criteria,
    otherGrades,
    priorFinalGrades,
    priorPeriod,
    previousFromMarking,
    strengths: report ? takeBullets(report.sections.strengths, report) : null,
    areas: report ? takeBullets(report.sections.areasForImprovement, report) : null,
    nextSteps: report ? takeBullets(report.sections.actionableSteps, report) : null,
    strands,
    weakTargets: weak.slice(0, 3),
    // Already examined on more than one task, so the weakness is the skill and
    // not the question. This is the exact version of "keeps coming back": it is
    // measured from what the student has actually sat, not guessed by matching
    // the name of a skill against the words in an upcoming lesson topic.
    recurringSkills: weak.filter((t) => t.assessmentTitles.length >= 2).slice(0, 3),
    commonMistakes: computeCommonMistakes(studentId),
    settleFirst: buildSettleFirst(criteria, report, unreviewedRubric),
    comingUp,
    focus,
  };
}
