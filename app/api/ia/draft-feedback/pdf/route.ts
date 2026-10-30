import fs from "node:fs";
import path from "node:path";
import { getIaExploration, getLatestIaDocument, getLatestIaOutput, getStudent } from "@/lib/db/queries";
import { buildAnnotatedPdf, type AnnotatedVersion } from "@/lib/ia/annotate-pdf";
import { injectNameDraftFeedback } from "@/lib/ia/render";
import { parseRubricItems } from "@/lib/ia/rubric-items";
import type { IaDraftFeedback } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ia/draft-feedback/pdf?explorationId=1&version=teacher|student
 *
 * The student's latest draft with the latest draft feedback drawn onto it, built
 * on this computer. Nothing here goes to the AI. A Word draft gets the summary
 * pages only, every comment listed with its location.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const explorationId = Number(url.searchParams.get("explorationId"));
  const version = url.searchParams.get("version") as AnnotatedVersion;
  if (!Number.isInteger(explorationId) || (version !== "teacher" && version !== "student")) {
    return new Response("explorationId and version=teacher|student are required.", { status: 400 });
  }
  const exploration = getIaExploration(explorationId);
  const student = exploration ? getStudent(exploration.student_id) : undefined;
  const draft = getLatestIaDocument(explorationId, "draft");
  const output = getLatestIaOutput(explorationId, "draft_feedback");
  if (!exploration || !student || !draft || !output) {
    return new Response("No draft feedback to download yet.", { status: 404 });
  }

  const feedback = injectNameDraftFeedback(output.content as IaDraftFeedback, student.name, student.pseudonym);
  let rubricText = "";
  try {
    rubricText = fs.readFileSync(path.join(process.cwd(), "specs", "reference", "exploration-rubric-sl-v1.4.txt"), "utf-8");
  } catch {
    // without the rubric, checklist items simply aren't drawn
  }
  const isPdf = !!draft.file_path && path.extname(draft.file_path).toLowerCase() === ".pdf" && fs.existsSync(draft.file_path);
  const { bytes } = buildAnnotatedPdf({
    pdfBytes: isPdf ? fs.readFileSync(draft.file_path as string) : null,
    feedback,
    rubric: parseRubricItems(rubricText),
    version,
    studentName: student.name,
  });

  const name = `${student.name} - IA draft feedback (${version === "teacher" ? "teacher copy" : "student"}).pdf`;
  const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
