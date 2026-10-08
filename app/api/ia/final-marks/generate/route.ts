import { NextResponse } from "next/server";
import { generateFinalMarks, MissingFinalError } from "@/lib/ia/marking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/ia/final-marks/generate  Body: { explorationId: number } */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { explorationId?: number } | null;
  if (!body || typeof body.explorationId !== "number") {
    return NextResponse.json({ error: "explorationId (number) is required." }, { status: 400 });
  }

  try {
    const output = await generateFinalMarks(body.explorationId);
    return NextResponse.json({ output });
  } catch (err) {
    if (err instanceof MissingFinalError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
