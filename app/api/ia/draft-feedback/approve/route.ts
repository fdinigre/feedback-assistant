import { NextResponse } from "next/server";
import { setIaMilestoneComplete, updateIaOutputStatus } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/ia/draft-feedback/approve  Body: { outputId: number; explorationId: number } */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { outputId?: number; explorationId?: number }
    | null;
  if (!body || typeof body.outputId !== "number" || typeof body.explorationId !== "number") {
    return NextResponse.json({ error: "outputId and explorationId are required." }, { status: 400 });
  }

  const output = updateIaOutputStatus(body.outputId, "approved");
  if (!output) return NextResponse.json({ error: "Output not found." }, { status: 404 });

  setIaMilestoneComplete(body.explorationId, "feedback_given");
  return NextResponse.json({ output });
}
