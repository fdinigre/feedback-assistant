import {
  getAssessment,
  getCriterionLevel,
  getSubmission,
  listGradings,
  upsertGrading,
} from "@/lib/db/queries";
import { recomputeCriterionA } from "@/lib/marking/criterion-a";

type Body = { submissionId: number };

/** "Accept all" — sets finalPoints = proposedPoints for every question of a submission. */
export async function POST(request: Request) {
  const body = (await request.json()) as Partial<Body>;

  if (typeof body.submissionId !== "number") {
    return Response.json({ error: "submissionId is required" }, { status: 400 });
  }

  const existing = listGradings(body.submissionId);
  const updated = existing.map((row) =>
    upsertGrading({
      submission_id: row.submission_id,
      question_id: row.question_id,
      content: { ...row.content, finalPoints: row.content.proposedPoints },
    })
  );

  // Criterion A follows from the marks, so it moves with them.
  const submission = getSubmission(body.submissionId);
  const assessment = submission ? getAssessment(submission.assessment_id) : undefined;
  const levelRecomputed = assessment
    ? recomputeCriterionA(assessment, body.submissionId, "accepting all proposed points")
    : false;

  return Response.json({
    gradings: updated,
    criterionLevel: levelRecomputed ? getCriterionLevel(body.submissionId, "A") : null,
  });
}
