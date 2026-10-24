import "server-only";

import path from "node:path";

import { listTaskDocuments } from "@/lib/db/queries";
import { pdfPageCount } from "@/lib/pdf";
import { findAssessmentPaper, resolveStoredPath } from "./file-paths";

/**
 * The PDF the name-mask preview shows: the blank paper, or — for a B/C/D task,
 * which has no blank paper until its parts are read off the task sheet — the task
 * sheet among its documents, then the template the students started from. Their
 * names go where those pages ask for them. Null when there is nothing to render:
 * the editor then shows a student's scan if there is one.
 */
export function previewPaperPath(assessmentId: number, paperFile: string | null): string | null {
  const paper = findAssessmentPaper(assessmentId, paperFile);
  if (paper && isPdf(paper)) return paper;
  const documents = listTaskDocuments(assessmentId);
  for (const kind of ["task", "template"] as const) {
    for (const doc of documents.filter((d) => d.kind === kind)) {
      const file = resolveStoredPath(doc.file_path);
      if (file && isPdf(file)) return file;
    }
  }
  return null;
}

function isPdf(file: string): boolean {
  return path.extname(file).toLowerCase() === ".pdf";
}

/**
 * Pages in that PDF, or 0 when there's nothing to render — no paper, a missing
 * file, a .docx (which can't be rasterized), or a PDF that won't open.
 *
 * Never throws: an unreadable paper should cost the teacher a preview, not the
 * whole setup page.
 */
export function paperPreviewPageCount(
  assessmentId: number,
  paperFile: string | null
): number {
  const resolved = previewPaperPath(assessmentId, paperFile);
  if (!resolved) return 0;
  try {
    return pdfPageCount(resolved);
  } catch {
    return 0;
  }
}
