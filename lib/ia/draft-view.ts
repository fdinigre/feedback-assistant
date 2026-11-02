// Where each feedback quote sits on the draft's pages, as fractions of the page, so
// the viewer can draw highlights over the page images at any zoom. Runs locally on
// the original PDF (mupdf); nothing here goes to the AI.

import * as mupdf from "mupdf";
import { indexPdfText, locateQuote } from "@/lib/ia/pdf-text";
import type { FeedbackTarget } from "@/lib/ia/feedback-targets";

export type Box = [number, number, number, number]; // left, top, right, bottom — fractions of the page
export type LocatedTarget = { page: number; boxes: Box[]; exact: boolean };

export function locateTargets(
  pdfBytes: Uint8Array,
  targets: Pick<FeedbackTarget, "id" | "quote" | "location">[]
): { pageCount: number; located: Record<string, LocatedTarget> } {
  const doc = mupdf.Document.openDocument(pdfBytes, "application/pdf");
  const pageCount = doc.countPages();
  const bounds = Array.from({ length: pageCount }, (_, i) => doc.loadPage(i).getBounds());
  const pages = indexPdfText(doc);
  const located: Record<string, LocatedTarget> = {};
  for (const t of targets) {
    const hit = locateQuote(pages, t.quote, t.location);
    if (!hit || hit.quads.length === 0) continue;
    const [x0, y0, x1, y1] = bounds[hit.page - 1];
    const w = x1 - x0 || 1;
    const h = y1 - y0 || 1;
    located[t.id] = {
      page: hit.page,
      exact: hit.exact,
      boxes: hit.quads.map((q) => {
        const xs = [q[0], q[2], q[4], q[6]];
        const ys = [q[1], q[3], q[5], q[7]];
        return [
          (Math.min(...xs) - x0) / w,
          (Math.min(...ys) - y0) / h,
          (Math.max(...xs) - x0) / w,
          (Math.max(...ys) - y0) / h,
        ] as Box;
      }),
    };
  }
  return { pageCount, located };
}
