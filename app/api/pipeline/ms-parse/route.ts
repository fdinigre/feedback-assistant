import { NextResponse } from "next/server";
import { parseMarkscheme } from "@/lib/pipeline/ms-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/pipeline/ms-parse  Body: { assessmentId: number } */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { assessmentId } = (body ?? {}) as { assessmentId?: number };
  if (typeof assessmentId !== "number") {
    return NextResponse.json({ error: "provide assessmentId (number)" }, { status: 400 });
  }

  try {
    const result = await parseMarkscheme(assessmentId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
