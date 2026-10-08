import {
  getAssessment,
  getCriterionLevel,
  getGrading,
  getQuestion,
  getSubmission,
  unapproveReportIfApproved,
  updateSubmission,
  upsertGrading,
} from "@/lib/db/queries";
import type { GradingQuestion } from "@/lib/types";
import { recomputeCriterionA } from "@/lib/marking/criterion-a";
import { settleIfSheetAgrees } from "@/lib/marks-import/pending";

type Body = {
  submissionId: number;
  questionId: number;
  content: GradingQuestion;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<Body> | null;

  if (
    !body ||
    typeof body.submissionId !== "number" ||
    typeof body.questionId !== "number" ||
    !body.content
  ) {
    return Response.json(
      { error: "submissionId, questionId and content are required" },
      { status: 400 }
    );
  }

  // Ownership: the question must belong to this submission's assessment.
  const submission = getSubmission(body.submissionId);
  const question = getQuestion(body.questionId);
  if (!submission) return Response.json({ error: "Submission not found" }, { status: 404 });
  if (!question) return Response.json({ error: "Question not found" }, { status: 404 });
  if (question.assessment_id !== submission.assessment_id) {
    return Response.json(
      { error: "Question does not belong to this submission's assessment" },
      { status: 400 }
    );
  }

  // Range: a teacher-final mark can't be negative or exceed the question's max.
  const finalPoints = body.content.finalPoints;
  if (
    finalPoints != null &&
    (!Number.isFinite(finalPoints) || finalPoints < 0 || finalPoints > question.max_points)
  ) {
    return Response.json(
      { error: `finalPoints must be between 0 and ${question.max_points}` },
      { status: 400 }
    );
  }

  // What the mark was before this save, so an unchanged save (a re-click, a
  // transcript-only edit) doesn't un-approve the report or rewrite the level.
  const previous = getGrading(body.submissionId, body.questionId)?.content;
  const markBefore = previous ? (previous.finalPoints ?? previous.conservativePoints) : null;
  const markAfter = body.content.finalPoints ?? body.content.conservativePoints;
  const markChanged = markBefore !== markAfter;

  const row = upsertGrading({
    submission_id: body.submissionId,
    question_id: body.questionId,
    content: body.content,
  });

  // Criterion A follows from the marks, so it moves with them.
  const assessment = getAssessment(submission.assessment_id);
  const levelRecomputed =
    assessment && markChanged
      ? recomputeCriterionA(assessment, body.submissionId, "a mark you saved")
      : false;

  // Typing in the sheet's mark by hand settles that difference as the button
  // does — and may be the last one on the paper.
  if (markChanged) settleIfSheetAgrees(submission.assessment_id, body.submissionId);

  // Changing a mark invalidates an approved report.
  if (markChanged && unapproveReportIfApproved(body.submissionId)) {
    updateSubmission(body.submissionId, { status: "graded" });
  }

  return Response.json({
    grading: row,
    criterionLevel: levelRecomputed ? getCriterionLevel(body.submissionId, "A") : null,
  });
}
