import {
  getQuestion,
  getSubmission,
  unapproveReportIfApproved,
  updateSubmission,
} from "@/lib/db/queries";
import {
  buildMarkValueMap,
  getDpGrading,
  recomputeAndPersistDpResult,
  upsertDpGrading,
} from "@/lib/submissions/dp-grading";
import { pickFinal, sumQuestionMarks } from "@/lib/submissions/dp-calc";
import type { DpGradingQuestion } from "@/lib/types";

type Body = {
  submissionId: number;
  questionId: number;
  markId: string;
  finalAwarded: boolean;
};

/**
 * POST /api/review/dp-marks
 * Toggles one mark's teacher-final award, updates gradings.content for that
 * question, recomputes the whole submission's total/pct/grade against the
 * assessment's boundaries, and persists that to dp_results.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as Partial<Body>;

  if (
    typeof body.submissionId !== "number" ||
    typeof body.questionId !== "number" ||
    typeof body.markId !== "string" ||
    typeof body.finalAwarded !== "boolean"
  ) {
    return Response.json(
      { error: "submissionId, questionId, markId and finalAwarded are required" },
      { status: 400 }
    );
  }

  const submission = getSubmission(body.submissionId);
  if (!submission) {
    return Response.json({ error: "Submission not found" }, { status: 404 });
  }

  const question = getQuestion(body.questionId);
  if (!question || !question.dp_scheme) {
    return Response.json(
      { error: "Question not found or has no DP mark scheme" },
      { status: 404 }
    );
  }

  const grading = getDpGrading(body.submissionId, body.questionId);
  if (!grading) {
    return Response.json(
      { error: "No grading found yet for this question — run grading first" },
      { status: 404 }
    );
  }

  let found = false;
  const nextSubparts = grading.content.subparts.map((subpart) => {
    if (!subpart.awards.some((award) => award.markId === body.markId)) return subpart;
    found = true;
    // Ticking a mark is itemising the part again: the total taken from the
    // teacher's marks sheet for it gives way to the ticks.
    const { teacherPoints: _fromSheet, ...rest } = subpart;
    void _fromSheet;
    return {
      ...rest,
      awards: subpart.awards.map((award) =>
        award.markId === body.markId ? { ...award, finalAwarded: body.finalAwarded } : award
      ),
    };
  });

  if (!found) {
    return Response.json(
      { error: `Mark ${body.markId} not found in this question's grading` },
      { status: 404 }
    );
  }

  // Built afresh, so a whole-question total from the marks sheet gives way too.
  const nextContent: DpGradingQuestion = {
    subparts: nextSubparts,
    totalAwarded: sumQuestionMarks(
      { subparts: nextSubparts, totalAwarded: 0 },
      question.dp_scheme,
      pickFinal
    ),
  };

  const updatedGrading = upsertDpGrading({
    submission_id: body.submissionId,
    question_id: body.questionId,
    content: nextContent,
  });

  const dpResult = recomputeAndPersistDpResult(submission.assessment_id, body.submissionId);

  // Changing a mark invalidates an approved report.
  if (unapproveReportIfApproved(body.submissionId)) {
    updateSubmission(body.submissionId, { status: "graded" });
  }

  return Response.json({ grading: updatedGrading, dpResult });
}
