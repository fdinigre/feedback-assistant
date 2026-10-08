import { NextResponse } from "next/server";
import { updateIaOutputContent } from "@/lib/db/queries";
import type { IaFinalMarks } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/ia/final-marks/save  Body: { outputId: number; content: IaFinalMarks } */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { outputId?: number; content?: IaFinalMarks }
    | null;
  if (!body || typeof body.outputId !== "number" || !body.content) {
    return NextResponse.json({ error: "outputId and content are required." }, { status: 400 });
  }

  const output = updateIaOutputContent(body.outputId, body.content);
  if (!output) return NextResponse.json({ error: "Output not found." }, { status: 404 });
  return NextResponse.json({ output });
}
