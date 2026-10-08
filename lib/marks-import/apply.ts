import "server-only";

import {
  getGrading,
  getReport,
  getSubmission,
  updateSubmission,
  upsertGrading,
} from "@/lib/db/queries";
import { recomputeCriterionA } from "@/lib/marking/criterion-a";
import type { AssessmentRow } from "@/lib/types";
import type { MarkChange } from "./diff";

export type ApplyResult = {
  marksChanged: number;
  levelsRecomputed: number;
  /** Papers whose report was written from the old marks, so the notice can link each one. */
  reportsAffected: number[];
  skipped: number;
};

/**
 * Writes the accepted marks and brings Criterion A back in line with them.
 *
 * The teacher's mark is stored as `finalPoints`, the same field the review
 * screen writes, so the AI's original proposal and its conservative second pass
 * stay on record beside it rather than being overwritten.
 */
export function applyMarkChanges(
  assessment: AssessmentRow,
  changes: MarkChange[]
): ApplyResult {
  let marksChanged = 0;
  const skipped = 0;
  const touchedSubmissions = new Set<number>();

  for (const change of changes) {
    const grading = getGrading(change.submissionId, change.questionId);
    if (grading) {
      upsertGrading({
        submission_id: change.submissionId,
        question_id: change.questionId,
        content: { ...grading.content, finalPoints: change.incoming },
      });
    } else {
      // Not marked by the app: the teacher's sheet is the only marking. Record it
      // as her final mark, with the AI columns set to the same value so nothing
      // downstream reads a mark the AI never gave.
      upsertGrading({
        submission_id: change.submissionId,
        question_id: change.questionId,
        content: {
          questionNumber: change.questionNumber,
          proposedPoints: change.incoming,
          conservativePoints: change.incoming,
          finalPoints: change.incoming,
          evidence: "Mark entered from the teacher's marks sheet; the app did not mark this question.",
          followThrough: false,
          conservativeArgument: null,
        },
      });
      const submission = getSubmission(change.submissionId);
      if (submission && (submission.status === "assigned" || submission.status === "transcribed")) {
        updateSubmission(change.submissionId, { status: "graded" });
      }
    }
    marksChanged++;
    touchedSubmissions.add(change.submissionId);
  }

  let levelsRecomputed = 0;
  const reportsAffected: number[] = [];

  for (const submissionId of touchedSubmissions) {
    if (recomputeCriterionA(assessment, submissionId, "the uploaded marks sheet")) levelsRecomputed++;
    if (getReport(submissionId)) reportsAffected.push(submissionId);
  }

  return { marksChanged, levelsRecomputed, reportsAffected, skipped };
}
