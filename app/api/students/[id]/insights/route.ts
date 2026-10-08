import { NextResponse } from "next/server";
import { getStudent } from "@/lib/db/queries";
import { generateInsights, getCachedInsights } from "@/lib/students/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/students/[id]/insights — returns the cached digest, or null if none exists yet. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const studentId = Number(id);
  if (!getStudent(studentId)) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }
  return NextResponse.json(getCachedInsights(studentId));
}

/** POST /api/students/[id]/insights — generates (or regenerates) the AI digest and caches it. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const studentId = Number(id);
  if (!getStudent(studentId)) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  try {
    const result = await generateInsights(studentId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate insights" },
      { status: 500 }
    );
  }
}
