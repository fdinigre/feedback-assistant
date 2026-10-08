import { NextResponse } from "next/server";
import { classifyErrors } from "@/lib/errors/classify";
import { hasErrorTags, hasSkillTags } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/pipeline/error-tags  Body: { submissionId: number } */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { submissionId } = (body ?? {}) as { submissionId?: number };
  if (typeof submissionId !== "number") {
    return NextResponse.json({ error: "provide submissionId (number)" }, { status: 400 });
  }

  // A paper sorted for mistake kinds before core skills existed only needs the
  // skills: its mistake counts have already been read, and re-running them would
  // shuffle them for nothing. Anything else is a full sort, including a re-run.
  const skillsOnly = hasErrorTags(submissionId) && !hasSkillTags(submissionId);
  try {
    return NextResponse.json(await classifyErrors(submissionId, { skillsOnly }));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
