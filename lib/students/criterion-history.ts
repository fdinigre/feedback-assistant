import "server-only";

import { listExternalDataBySource } from "@/lib/db/queries";
import { computeSubmissionGrade, type SubmissionGrade } from "@/lib/students/grade-cell";
import { listGradedSubmissions } from "@/lib/students/shared";
import { semesterOf } from "@/lib/students/semester";
import type { Criterion } from "@/lib/types";

/**
 * A student's criterion levels across everything they have sat, grouped by
 * criterion rather than by assessment.
 *
 * MYP tasks assess different criteria — one covers A and C, the next B alone —
 * so "their latest assessment" is not the same as "where they stand". A student
 * whose most recent task was Criterion B only has A and C on record too, and
 * both the profile header and the conference brief have to show all of them.
 * Never averaged: there is no total across criteria.
 */

const CRIT_ORDER: Criterion[] = ["A", "B", "C", "D"];

export type TrendArrow = "up" | "down" | "same";

export type CriterionPoint = {
  submissionId: number;
  assessmentTitle: string;
  date: string | null;
  /** "2026-27 S1": which semester the task was sat in, from its date. */
  semester: string;
  level: number;
  /** Still the AI's conservative reading, with no teacher review behind it. */
  provisional: boolean;
};

/** One imported record of where this student finished before the current year. */
export type PriorLevel = {
  /** The period as imported, e.g. "2025-26 S2". */
  period: string;
  /** Just the school year part, so a two-year course can group by it. */
  schoolYear: string;
  level: number;
};

export type CriterionHistory = {
  criterion: string;
  /** Oldest first; the last entry is where the student currently stands. */
  points: CriterionPoint[];
  /** The latest level against the prior record on file, where there is one. */
  trend: TrendArrow | null;
  /**
   * Every prior record on file for this criterion, oldest first. The arrow above
   * only says which way; a chart needs the number it is comparing against, and a
   * two-year course needs all of them rather than the most recent.
   */
  prior: PriorLevel[];
};

/** A DP final grade (1-7) carried in from a prior year of the same course. */
export type PriorFinalGrade = {
  period: string;
  schoolYear: string;
  grade: number;
  /** Where this app's marking left them, standing in for a semester nobody imported. */
  fromMarking?: boolean;
};

/** A grade that does not pivot by criterion: a DP grade, or a points-only test. */
export type OtherGrade = {
  submissionId: number;
  assessmentTitle: string;
  date: string | null;
  semester: string;
  grade: SubmissionGrade;
};

/**
 * PRIOR_GRADES rows come from the teacher's own spreadsheet columns (see the
 * template in app/api/templates/external/[source]/route.ts) — values are
 * arbitrary strings from the import, so parse defensively.
 */
function parsePriorNumber(data: unknown, column: string): number | null {
  if (!data || typeof data !== "object") return null;
  const raw = (data as Record<string, unknown>)[column];
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * "2025-26 S1" -> "2025-26". Written by periodOf in app/classes/[id]/actions.ts;
 * anything that does not match keeps its whole period as the year, so a record
 * imported before semesters existed still groups with itself rather than
 * disappearing.
 */
/** The period, or what the older import called itself in its "Year" column. */
function periodLabelOf(row: { period: string | null; data: unknown }): string {
  if (row.period) return row.period;
  const data = row.data as Record<string, unknown> | null;
  const year = data && typeof data === "object" ? data["Year"] : null;
  return year ? String(year) : "Earlier";
}

function schoolYearOf(period: string): string {
  const match = /^(\d{4}-\d{2})/.exec(period);
  return match ? match[1] : period;
}

export type CriterionHistoryResult = {
  criteria: CriterionHistory[];
  otherGrades: OtherGrade[];
  /** Prior-year DP final grades, for a course that spans grades 11 and 12. */
  priorFinalGrades: PriorFinalGrade[];
  hasPriorGrades: boolean;
  /** Which prior record the arrows compare against, e.g. "2025-26 S2". */
  priorPeriod: string | null;
};

export function computeCriterionHistory(studentId: number): CriterionHistoryResult {
  const byCriterion = new Map<string, CriterionPoint[]>();
  const otherGrades: OtherGrade[] = [];

  for (const { assessment, submission } of listGradedSubmissions(studentId)) {
    const grade = computeSubmissionGrade(assessment, submission);
    // An undated task counts from when it was set up.
    const semester = semesterOf(assessment.date ?? assessment.created_at.slice(0, 10));
    if (grade.kind === "myp") {
      for (const level of grade.levels) {
        const points = byCriterion.get(level.criterion) ?? [];
        points.push({
          submissionId: submission.id,
          assessmentTitle: assessment.title,
          date: assessment.date,
          semester,
          level: level.level,
          provisional: level.provisional,
        });
        byCriterion.set(level.criterion, points);
      }
    } else {
      otherGrades.push({
        submissionId: submission.id,
        assessmentTitle: assessment.title,
        date: assessment.date,
        semester,
        grade,
      });
    }
  }

  // Every prior record, oldest first. Prior grades are kept per semester, and a
  // DP course spans two school years, so the latest one is not the whole story.
  // An older import carried no period at all and labelled itself in a "Year"
  // column instead; those rows are 17 students' entire history, so they are
  // kept and sorted first rather than filtered out for lacking a period.
  const priorRows = [...listExternalDataBySource(studentId, "PRIOR_GRADES")].sort((a, b) =>
    (a.period ?? "").localeCompare(b.period ?? "")
  );
  const latestPrior = priorRows[priorRows.length - 1] ?? null;

  const criteria = [...byCriterion.entries()]
    .sort((a, b) => CRIT_ORDER.indexOf(a[0] as Criterion) - CRIT_ORDER.indexOf(b[0] as Criterion))
    .map(([criterion, points]) => {
      const latest = points[points.length - 1];

      const prior: PriorLevel[] = [];
      for (const row of priorRows) {
        const level = parsePriorNumber(row.data, `Criterion ${criterion}`);
        if (level == null || level === 0) continue; // 0 means "not assessed"
        const period = periodLabelOf(row);
        prior.push({ period, schoolYear: schoolYearOf(period), level });
      }

      const priorLevel = prior[prior.length - 1]?.level ?? null;
      const trend: TrendArrow | null =
        priorLevel == null
          ? null
          : latest.level > priorLevel
            ? "up"
            : latest.level < priorLevel
              ? "down"
              : "same";
      return { criterion, points, trend, prior };
    });

  const priorFinalGrades: PriorFinalGrade[] = [];
  for (const row of priorRows) {
    const grade = parsePriorNumber(row.data, "Final grade") ?? parsePriorNumber(row.data, "G9 EOY Grade");
    if (grade == null || grade === 0) continue;
    const period = periodLabelOf(row);
    priorFinalGrades.push({ period, schoolYear: schoolYearOf(period), grade });
  }

  return {
    criteria,
    otherGrades,
    priorFinalGrades,
    hasPriorGrades: priorRows.length > 0,
    priorPeriod: latestPrior?.period ?? null,
  };
}
