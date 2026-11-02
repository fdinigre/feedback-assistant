import { NextResponse } from "next/server";
import { currentRun, startClassRun, stopClassRun } from "@/lib/ia/class-run";
import { getIaExploration } from "@/lib/db/queries";
import type { ClassJob } from "@/lib/ia/class-run-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/ia/class-run — the current (or last) class run, or null. */
export async function GET() {
  return NextResponse.json({ run: currentRun() });
}

/**
 * POST /api/ia/class-run
 *   { action: "start", classId, job: "feedback" | "math", explorationIds: number[] }
 *   { action: "stop" }
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { action?: string; classId?: number; job?: string; explorationIds?: number[] }
    | null;
  if (body?.action === "stop") return NextResponse.json({ run: stopClassRun() });
  if (body?.action !== "start" || typeof body.classId !== "number" || (body.job !== "feedback" && body.job !== "math") || !Array.isArray(body.explorationIds)) {
    return NextResponse.json({ error: "action, classId, job and explorationIds are required." }, { status: 400 });
  }
  const items = body.explorationIds
    .filter((id) => Number.isInteger(id))
    .map((id) => getIaExploration(id))
    .filter((e): e is NonNullable<typeof e> => !!e)
    .map((e) => ({ studentId: e.student_id, explorationId: e.id }));
  const { run, error } = startClassRun(body.classId, body.job as ClassJob, items);
  if (error) return NextResponse.json({ error, run: currentRun() }, { status: 409 });
  return NextResponse.json({ run });
}
