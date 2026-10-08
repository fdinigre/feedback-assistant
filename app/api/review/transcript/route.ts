import {
  getQuestion,
  getSubmission,
  unapproveReportIfApproved,
  updateSubmission,
  upsertTranscript,
} from "@/lib/db/queries";
import type { TranscriptQuestion } from "@/lib/types";

type Body = {
  submissionId: number;
  questionId: number;
  content: TranscriptQuestion;
};

/**
 * Saving a question's transcript means the teacher has reviewed its steps, so any illegible
 * flag still pending is resolved from the current step text: a step with real text becomes the
 * resolution; a step left blank or still holding a "[?]" placeholder is marked unreadable (no
 * credit). This is why the red flags clear on Save — she never re-types what she fixed above.
 * A step she has taken out of the answer is exempt: it is settled by being omitted, and calling
 * it unreadable would be recording something she never said.
 *
 * The same reasoning settles "low confidence", which is the model's doubt about its own
 * reading: once she has looked at the steps and saved them, the text on record is hers.
 * Leaving the flag up meant a question she had already been through stayed amber for good.
 */
function markReviewed(content: TranscriptQuestion): TranscriptQuestion {
  if (!content || !Array.isArray(content.illegible)) return content;
  const illegible = content.illegible.map((f) => {
    if (f.resolvedText !== undefined) return f;
    const step = content.steps?.[f.stepIndex];
    // A line she has taken out of the answer is settled by that, not by being
    // called unreadable. This used to be the only way out: clearing the text of
    // a line that was not part of the answer saved it as "unreadable", which is
    // why that count stopped meaning anything.
    if (step?.omitted) return f;
    const stepText = step?.text ?? "";
    const usable = stepText.trim() !== "" && !stepText.includes("[?]");
    return { ...f, resolvedText: usable ? stepText : "" };
  });
  const steps = Array.isArray(content.steps)
    ? content.steps.map((s) => ({ ...s, confident: true }))
    : content.steps;
  return { ...content, steps, illegible };
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<Body>;

  if (
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
  if (!question || question.assessment_id !== submission.assessment_id) {
    return Response.json(
      { error: "Question does not belong to this submission's assessment" },
      { status: 400 }
    );
  }

  const row = upsertTranscript({
    submission_id: body.submissionId,
    question_id: body.questionId,
    content: markReviewed(body.content),
  });

  // Editing the transcript changes the evidence — any approved report is now stale.
  if (unapproveReportIfApproved(body.submissionId)) {
    updateSubmission(body.submissionId, { status: "graded" });
  }

  return Response.json({ transcript: row });
}
