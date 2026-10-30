import { NextResponse } from "next/server";
import { generateMathCheckOnly, MissingDraftError } from "@/lib/ia/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/ia/math-check  Body: { explorationId: number } — runs only the math check on the latest draft. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { explorationId?: number } | null;
  if (!body || typeof body.explorationId !== "number") {
    return NextResponse.json({ error: "explorationId (number) is required." }, { status: 400 });
  }
  try {
    const output = await generateMathCheckOnly(body.explorationId);
    return NextResponse.json({ output });
  } catch (err) {
    if (err instanceof MissingDraftError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
