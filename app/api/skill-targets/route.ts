import { NextResponse } from "next/server";
import { listStudentsNeedingSkillTargets } from "@/lib/students/skillTargets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/skill-targets — the students whose learning targets are missing or out of date. */
export async function GET() {
  return NextResponse.json(listStudentsNeedingSkillTargets());
}
