import { NextResponse } from "next/server";
import { transcribeSubmission, transcribeSubmissions } from "@/lib/pipeline/transcribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/pipeline/transcribe
 * Body: { submissionId: number } OR { submissionIds: number[] } (batch, sequential).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { submissionId, submissionIds } = (body ?? {}) as {
    submissionId?: number;
    submissionIds?: number[];
  };

  try {
    if (Array.isArray(submissionIds)) {
      const out = await transcribeSubmissions(submissionIds);
      return NextResponse.json(out);
    }
    if (typeof submissionId === "number") {
      const result = await transcribeSubmission(submissionId);
      return NextResponse.json(result);
    }
    return NextResponse.json(
      { error: "provide submissionId (number) or submissionIds (number[])" },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
