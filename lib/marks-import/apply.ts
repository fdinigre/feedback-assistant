import "server-only";

import {
  getGrading,
  getQuestion,
  getReport,
  getSubmission,
  updateSubmission,
  upsertGrading,
} from "@/lib/db/queries";
import { recomputeCriterionA } from "@/lib/marking/criterion-a";
import { getDpGrading, recomputeAndPersistDpResult, upsertDpGrading } from "@/lib/submissions/dp-grading";
import type { AssessmentRow, DpGradingQuestion } from "@/lib/types";
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

/**
 * The Diploma counterpart. A DP paper is marked mark by mark (M1, A1 …) while the
 * teacher's sheet holds totals, so the sheet's total is recorded as the teacher's
 * points for that part — or for the whole question — and stands in for the awards
 * in every final total (lib/submissions/dp-calc.ts). The awards stay on record
 * beside it, and toggling one later returns the part to being itemised.
 */
export function applyDpMarkChanges(assessment: AssessmentRow, changes: MarkChange[]): ApplyResult {
  let marksChanged = 0;
  const touchedSubmissions = new Set<number>();

  for (const change of changes) {
    const question = getQuestion(change.questionId);
    const existing = getDpGrading(change.submissionId, change.questionId)?.content;
    // Not marked by the app: the teacher's sheet is the only marking. Start an
    // empty grading in the markscheme's shape, with nothing awarded.
    const content: DpGradingQuestion = existing ?? {
      subparts: (question?.dp_scheme?.subparts ?? []).map((sp) => ({ label: sp.label, awards: [], flags: [] })),
      totalAwarded: 0,
    };

    let next: DpGradingQuestion;
    if (change.part === "") {
      next = { ...content, teacherPoints: change.incoming };
    } else {
      const has = content.subparts.some((sp) => sp.label === change.part);
      const subparts = has
        ? content.subparts.map((sp) => (sp.label === change.part ? { ...sp, teacherPoints: change.incoming } : sp))
        : [...content.subparts, { label: change.part, awards: [], flags: [], teacherPoints: change.incoming }];
      next = { ...content, subparts };
    }
    upsertDpGrading({ submission_id: change.submissionId, question_id: change.questionId, content: next });

    if (!existing) {
      const submission = getSubmission(change.submissionId);
      if (submission && (submission.status === "assigned" || submission.status === "transcribed")) {
        updateSubmission(change.submissionId, { status: "graded" });
      }
    }
    marksChanged++;
    touchedSubmissions.add(change.submissionId);
  }

  const reportsAffected: number[] = [];
  for (const submissionId of touchedSubmissions) {
    // The paper's total, % and grade follow the new marks at once.
    recomputeAndPersistDpResult(assessment.id, submissionId);
    if (getReport(submissionId)) reportsAffected.push(submissionId);
  }

  return { marksChanged, levelsRecomputed: 0, reportsAffected, skipped: 0 };
}
