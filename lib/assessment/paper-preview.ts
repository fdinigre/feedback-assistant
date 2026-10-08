import "server-only";

import path from "node:path";

import { pdfPageCount } from "@/lib/pdf";
import { findAssessmentPaper } from "./file-paths";

/**
 * Pages in the uploaded blank paper that can be rendered for the name-mask
 * preview, or 0 when there's nothing to render — no paper, a missing file, a
 * .docx (which can't be rasterized), or a PDF that won't open.
 *
 * Never throws: an unreadable paper should cost the teacher a preview, not the
 * whole setup page.
 */
export function paperPreviewPageCount(
  assessmentId: number,
  paperFile: string | null
): number {
  const resolved = findAssessmentPaper(assessmentId, paperFile);
  if (!resolved) return 0;
  if (path.extname(resolved).toLowerCase() !== ".pdf") return 0;
  try {
    return pdfPageCount(resolved);
  } catch {
    return 0;
  }
}
