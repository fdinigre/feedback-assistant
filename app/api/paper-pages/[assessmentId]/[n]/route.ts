import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { getAssessment } from "@/lib/db/queries";
import { previewPaperPath } from "@/lib/assessment/paper-preview";
import { pdfPageCount, rasterizePdfPage } from "@/lib/pdf";

// Serves a page of the BLANK uploaded exam paper as a PNG, for the name-mask
// preview. The mask is a property of the paper's layout, so it should be
// positioned against the paper itself rather than against whichever student
// scan happened to be uploaded first.
//
// Rendered on demand and cached next to the paper: rasterizing a whole paper to
// show one page would be wasteful, and papers change when re-uploaded.

const SAFE_SEGMENT = /^[0-9]+$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assessmentId: string; n: string }> }
) {
  const { assessmentId, n } = await params;
  if (!SAFE_SEGMENT.test(assessmentId) || !SAFE_SEGMENT.test(n)) {
    return new Response("Invalid path", { status: 400 });
  }

  const assessment = getAssessment(Number(assessmentId));
  if (!assessment) return new Response("Assessment not found", { status: 404 });

  // The blank paper, or a B/C/D task's task sheet or template until it has one.
  // Null also for a .docx paper, which can't be rendered: the caller falls back to a scan.
  const paperPath = previewPaperPath(Number(assessmentId), assessment.paper_file);
  if (!paperPath) return new Response("No paper to preview", { status: 404 });

  const pageNumber = Number(n);
  // Cached per source file: the preview can move from the task sheet to the paper
  // read off it, and an older file must never be shown from a newer cache.
  const source = createHash("sha1").update(paperPath).digest("hex").slice(0, 10);
  const cachePath = path.join(
    process.cwd(),
    "data",
    "papers",
    assessmentId,
    "preview",
    `${source}-page-${pageNumber}.png`
  );

  try {
    // Re-render if the paper is newer than the cached image (i.e. re-uploaded).
    const stale =
      !fs.existsSync(cachePath) ||
      fs.statSync(paperPath).mtimeMs > fs.statSync(cachePath).mtimeMs;

    if (stale) {
      if (pageNumber > pdfPageCount(paperPath)) {
        return new Response("Page out of range", { status: 404 });
      }
      rasterizePdfPage(paperPath, pageNumber, cachePath);
    }

    const buffer = await fs.promises.readFile(cachePath);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch {
    return new Response("Could not render that page of the paper", { status: 500 });
  }
}
