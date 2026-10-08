import "server-only";

import { getStudent, listCriterionLevels, listSubmissions } from "@/lib/db/queries";
import { isFmTest } from "@/lib/assessment/course";
import { computeSubmissionGrade } from "@/lib/students/grade-cell";
import type { AssessmentRow, SubmissionStatus } from "@/lib/types";

/** One criterion level as the table shows it. */
export type GradeCell = {
  /** The final level if she has set one, else the tool's cautious level. */
  level: number;
  /** True while that is still the tool's reading, not a level she confirmed. */
  provisional: boolean;
  proposed: number;
  conservative: number;
};

export type GradesRow = {
  submissionId: number;
  name: string;
  status: SubmissionStatus;
  /** MYP: by criterion letter. Empty for a DP or points-only task. */
  levels: Record<string, GradeCell>;
  /** DP: the 1-7 grade; points-only: "21/26". Null for a criterion-levels task. */
  summary: string | null;
  /** DP: the percentage under the grade. */
  summarySub: string | null;
};

export type GradesTable = {
  /** "levels": one editable column per criterion. "summary": a single read-only grade. */
  kind: "levels" | "summary";
  criteria: string[];
  rows: GradesRow[];
  /** Papers marked so far, out of `total` (assigned and not absent). */
  marked: number;
  total: number;
};

/**
 * Every student on one assessment with their grade, laid out to be read against
 * her own markbook in one view. Criterion levels are the editable part: a DP
 * grade and a points total are worked out from the marks, so they change by
 * changing the marks, on the paper.
 */
export function buildGradesTable(assessment: AssessmentRow): GradesTable {
  const kind = assessment.programme === "DP" || isFmTest(assessment) ? "summary" : "levels";
  const rows: GradesRow[] = [];
  let marked = 0;
  let total = 0;

  for (const submission of listSubmissions(assessment.id)) {
    if (submission.student_id === null) continue;
    const student = getStudent(submission.student_id);
    if (!student) continue;
    const isMarked = submission.status === "graded" || submission.status === "reviewed";
    if (submission.status !== "absent") total += 1;
    if (isMarked) marked += 1;

    const levels: Record<string, GradeCell> = {};
    let summary: string | null = null;
    let summarySub: string | null = null;

    if (kind === "levels") {
      for (const row of listCriterionLevels(submission.id)) {
        levels[row.criterion] = {
          level: row.level_final ?? row.level_conservative,
          provisional: row.level_final === null,
          proposed: row.level_proposed,
          conservative: row.level_conservative,
        };
      }
    } else if (isMarked) {
      const grade = computeSubmissionGrade(assessment, submission);
      if (grade.kind === "dp") {
        summary = String(grade.grade);
        summarySub = `${grade.pct.toFixed(0)}%`;
      } else if (grade.kind === "points") {
        summary = grade.label;
      }
    }

    rows.push({
      submissionId: submission.id,
      name: student.name,
      status: submission.status,
      levels,
      summary,
      summarySub,
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { kind, criteria: assessment.criteria, rows, marked, total };
}
