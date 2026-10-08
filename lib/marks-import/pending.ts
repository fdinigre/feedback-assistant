import "server-only";

import {
  getStudent,
  getSubmission,
  listGradings,
  listQuestions,
  listSheetMarks,
  listSheetMarksForAssessment,
  replaceSheetMarks,
  setSheetMarkResolution,
} from "@/lib/db/queries";
import type {
  AssessmentRow,
  SheetDifference,
  SheetDifferenceStatus,
  SheetMarkRow,
} from "@/lib/types";
import { settleSubmission } from "@/lib/marking/settle";
import { applyMarkChanges, type ApplyResult } from "./apply";
import type { MarksDiff } from "./diff";

/**
 * Where the teacher's uploaded sheet disagreed with the app, kept until the
 * teacher deletes the sheet. Differences still waiting are flagged on the
 * student's review page — beside the paper and the AI's justification — and
 * settled ones stay in the comparison with the choice that was made.
 */

/** Remembers the differences found by an upload, replacing the previous upload's. */
export function storeSheetDifferences(assessment: AssessmentRow, diff: MarksDiff): void {
  replaceSheetMarks(
    assessment.id,
    diff.changes
      // Over-maximum marks are mistakes in the sheet, not decisions to keep. An
      // unmarked question is kept: the sheet may be the only marking there is.
      .filter((c) => !c.overMax)
      .map((c) => ({
        submission_id: c.submissionId,
        question_id: c.questionId,
        points: c.incoming,
        from_blank: c.fromBlank,
        app_points: c.current,
      }))
  );
}

function toDifferences(assessmentId: number, rows: SheetMarkRow[]): SheetDifference[] {
  const questionById = new Map(listQuestions(assessmentId).map((q) => [q.id, q]));
  const bySubmission = new Map<number, SheetMarkRow[]>();
  for (const row of rows) {
    bySubmission.set(row.submission_id, [...(bySubmission.get(row.submission_id) ?? []), row]);
  }

  const differences: SheetDifference[] = [];
  for (const [submissionId, marks] of bySubmission) {
    const submission = getSubmission(submissionId);
    const student = submission?.student_id ? getStudent(submission.student_id) : undefined;
    const gradingByQuestion = new Map(listGradings(submissionId).map((g) => [g.question_id, g]));

    for (const mark of marks) {
      const question = questionById.get(mark.question_id);
      if (!question) continue;
      const grading = gradingByQuestion.get(mark.question_id);
      const current = grading
        ? (grading.content.finalPoints ?? grading.content.conservativePoints)
        : null;
      // Agreement wins over the recorded choice: a mark typed in by hand on the
      // review page settles the difference just as the button does.
      const status: SheetDifferenceStatus =
        current === mark.points
          ? "mine"
          : mark.resolution === "app"
            ? "app"
            : mark.resolution === "mine"
              ? "edited"
              : "waiting";
      differences.push({
        status,
        appAtUpload: mark.app_points,
        submissionId,
        studentName: student?.name ?? `Submission ${submissionId}`,
        questionId: question.id,
        questionNumber: question.number,
        maxPoints: question.max_points,
        current,
        sheet: mark.points,
        fromBlank: mark.from_blank,
      });
    }
  }
  return differences.sort(
    (a, b) => a.studentName.localeCompare(b.studentName) || a.questionId - b.questionId
  );
}

/** Every difference the sheet had, settled or not. */
export function listSheetDifferences(assessmentId: number): SheetDifference[] {
  return toDifferences(assessmentId, listSheetMarksForAssessment(assessmentId));
}

/** The differences on one paper the teacher still has to decide. */
export function listWaitingDifferencesForSubmission(
  assessmentId: number,
  submissionId: number
): SheetDifference[] {
  // A question the app never marked has nothing to compare on the paper; it is
  // settled from the upload panel instead.
  return toDifferences(assessmentId, listSheetMarks(submissionId)).filter(
    (d) => d.status === "waiting" && d.current !== null
  );
}

/**
 * Applies the teacher's stored sheet mark for each (submission, question) key.
 * The mark comes from the database, never from the caller, so a request can
 * only ever apply what the teacher's own sheet said.
 */
export function applySheetMarks(
  assessment: AssessmentRow,
  keys: { submissionId: number; questionId: number }[]
): ApplyResult {
  const wanted = new Set(keys.map((k) => `${k.submissionId}:${k.questionId}`));
  const chosen = listSheetDifferences(assessment.id).filter(
    (d) => d.status !== "mine" && wanted.has(`${d.submissionId}:${d.questionId}`)
  );

  const result = applyMarkChanges(
    assessment,
    chosen.map((d) => ({
      submissionId: d.submissionId,
      studentName: d.studentName,
      questionId: d.questionId,
      questionNumber: d.questionNumber,
      label: `Q${d.questionNumber}`,
      maxPoints: d.maxPoints,
      current: d.current,
      incoming: d.sheet,
      fromBlank: d.fromBlank,
      overMax: false,
    }))
  );
  for (const d of chosen) setSheetMarkResolution(d.submissionId, d.questionId, "mine");
  return result;
}

/** The teacher looked and prefers the app's mark: stop flagging the difference. */
export function keepAppMark(submissionId: number, questionId: number): void {
  setSheetMarkResolution(submissionId, questionId, "app");
}

/**
 * Once the marks sheet and the app agree on a paper — nothing differed, or
 * every difference has been decided — the teacher has checked every mark on it,
 * so the paper's marks and levels are settled as an approved report settles
 * them (lib/marking/settle.ts). Returns whether it settled.
 *
 * `coveredBySheet` is for the upload itself, where a paper whose marks all
 * agreed has no stored differences to show it was on the sheet at all.
 */
export function settleIfSheetAgrees(
  assessmentId: number,
  submissionId: number,
  coveredBySheet = false
): boolean {
  const rows = listSheetMarks(submissionId);
  if (rows.length === 0 && !coveredBySheet) return false;
  if (toDifferences(assessmentId, rows).some((d) => d.status === "waiting")) return false;
  settleSubmission(submissionId);
  return true;
}
