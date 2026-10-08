import { NextResponse } from "next/server";
import { getIaOutput, setIaMilestoneComplete, updateIaOutputStatus } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/ia/final-marks/approve  Body: { outputId: number; explorationId: number } */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { outputId?: number; explorationId?: number }
    | null;
  if (!body || typeof body.outputId !== "number" || typeof body.explorationId !== "number") {
    return NextResponse.json({ error: "outputId and explorationId are required." }, { status: 400 });
  }

  // Ownership + kind: the output must belong to this exploration and be final marks —
  // don't mark an exploration "marked" off an unrelated or wrong-kind output.
  const existing = getIaOutput(body.outputId);
  if (!existing || existing.exploration_id !== body.explorationId) {
    return NextResponse.json(
      { error: "Output not found for this exploration." },
      { status: 404 }
    );
  }
  if (existing.kind !== "final_marks") {
    return NextResponse.json(
      { error: "Only a final-marks output can be approved here." },
      { status: 400 }
    );
  }

  const output = updateIaOutputStatus(body.outputId, "approved");
  setIaMilestoneComplete(body.explorationId, "marked");
  return NextResponse.json({ output });
}
