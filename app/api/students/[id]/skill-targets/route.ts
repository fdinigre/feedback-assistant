import { NextResponse } from "next/server";
import { getStudent } from "@/lib/db/queries";
import { getCachedSkillTargets, queueSkillTargets } from "@/lib/students/skillTargets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/students/[id]/skill-targets — the saved targets, or null if none yet. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const studentId = Number(id);
  if (!getStudent(studentId)) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }
  return NextResponse.json(getCachedSkillTargets(studentId));
}

/**
 * POST /api/students/[id]/skill-targets — writes the targets that are missing or
 * out of date and saves them. `?force=1` rewrites all of them.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const studentId = Number(id);
  if (!getStudent(studentId)) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }
  try {
    const force = new URL(request.url).searchParams.get("force") === "1";
    const result = await queueSkillTargets(studentId, { force });
    if (!result) {
      return NextResponse.json(
        { error: "No prior-knowledge skill has cost marks on the papers sorted so far." },
        { status: 400 }
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to write learning targets" },
      { status: 500 }
    );
  }
}
