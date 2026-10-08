import "server-only";

import { getDpResult, listCriterionLevels } from "@/lib/db/queries";
import { isFmTest } from "@/lib/assessment/course";
import { formatTestScore, testScore } from "@/lib/assessment/test-score";
import type { AssessmentRow, Criterion, SubmissionRow } from "@/lib/types";

/**
 * What one student got on one assessment, as data rather than as a string.
 *
 * The gradebook renders this as "A4 C3" in a table cell; a conference brief wants
 * the same facts laid out per criterion in full sentences. Deriving both from one
 * place is what stops the two from ever disagreeing about a student's grade.
 */

const CRIT_ORDER: Criterion[] = ["A", "B", "C", "D"];

export type CriterionLevelResult = {
  criterion: string;
  level: number;
  /**
   * True while the level is still the AI's conservative reading — the teacher has
   * not reviewed this submission, so the number may yet change. Nothing that is
   * read out to a parent should present it as settled.
   */
  provisional: boolean;
};

export type SubmissionGrade =
  | { kind: "none" }
  | { kind: "dp"; grade: number; pct: number }
  | { kind: "points"; earned: number; max: number; label: string }
  | { kind: "myp"; levels: CriterionLevelResult[] };

export function computeSubmissionGrade(
  assessment: AssessmentRow,
  submission: SubmissionRow
): SubmissionGrade {
  if (assessment.programme === "DP") {
    const result = getDpResult(submission.id);
    if (!result) return { kind: "none" };
    return { kind: "dp", grade: result.grade_final ?? result.grade, pct: result.pct };
  }

  if (isFmTest(assessment)) {
    const score = testScore(assessment, submission);
    if (!score) return { kind: "none" };
    return {
      kind: "points",
      earned: score.earned,
      max: score.max,
      label: formatTestScore(score),
    };
  }

  const levels = listCriterionLevels(submission.id)
    .sort((a, b) => CRIT_ORDER.indexOf(a.criterion as Criterion) - CRIT_ORDER.indexOf(b.criterion as Criterion))
    .map((l) => ({
      criterion: l.criterion,
      level: l.level_final ?? l.level_conservative,
      provisional: l.level_final === null,
    }));
  if (levels.length === 0) return { kind: "none" };
  return { kind: "myp", levels };
}

/** The one-cell rendering: "6", "12/15", "A4 C3", "—" when nothing is graded yet. */
export function formatCompact(grade: SubmissionGrade): string {
  switch (grade.kind) {
    case "dp":
      return String(grade.grade);
    case "points":
      return grade.label;
    case "myp":
      return grade.levels.map((l) => `${l.criterion}${l.level}`).join(" ");
    case "none":
      return "—";
  }
}
