import { NextResponse } from "next/server";
import { gradeSubmission, UnresolvedFlagsError } from "@/lib/pipeline/grade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/pipeline/grade  Body: { submissionId: number } */
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
    const result = await gradeSubmission(submissionId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UnresolvedFlagsError) {
      // Precondition failed: illegible flags still need the teacher.
      return NextResponse.json(
        { error: err.message, unresolvedFlags: err.flags },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
