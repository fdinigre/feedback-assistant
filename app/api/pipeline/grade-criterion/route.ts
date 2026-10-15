import { NextResponse } from "next/server";
import { gradeCriterionLevel, UnresolvedFlagsError } from "@/lib/pipeline/grade";
import { ALL_CRITERIA } from "@/lib/assessment/criteria";
import type { Criterion } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/pipeline/grade-criterion  Body: { submissionId: number, criterion: "B" | "C" | "D" }
 * One criterion's level for a paper already graded, without marking the points again.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { submissionId, criterion } = (body ?? {}) as { submissionId?: number; criterion?: string };
  if (typeof submissionId !== "number" || !ALL_CRITERIA.includes(criterion as Criterion)) {
    return NextResponse.json({ error: "provide submissionId (number) and criterion (A-D)" }, { status: 400 });
  }

  try {
    return NextResponse.json(await gradeCriterionLevel(submissionId, criterion as Criterion));
  } catch (err) {
    if (err instanceof UnresolvedFlagsError) {
      return NextResponse.json({ error: err.message, unresolvedFlags: err.flags }, { status: 409 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
