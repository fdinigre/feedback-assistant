import { NextResponse } from "next/server";
import { getAssessment, getSubmission } from "@/lib/db/queries";
import { generateReport } from "@/lib/pipeline/report";
import { generateDpReport } from "@/lib/pipeline/report-dp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/pipeline/report  Body: { submissionId: number } */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { submissionId } = (body ?? {}) as { submissionId?: number };
  if (typeof submissionId !== "number") {
    return NextResponse.json({ error: "provide submissionId (number)" }, { status: 400 });
  }

  try {
    // Branch by the submission's assessment programme — DP assessments get the
    // DP-specific report generator (mark boundaries, learning targets, Year 1 +
    // in-app DP history correlation); MYP flow is unchanged below.
    const submission = getSubmission(submissionId);
    const assessment = submission ? getAssessment(submission.assessment_id) : undefined;
    const result =
      assessment?.programme === "DP"
        ? await generateDpReport(submissionId)
        : await generateReport(submissionId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
