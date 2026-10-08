// Note: no "server-only" import here (unlike lib/db and lib/ai) — this module
// handles no secrets/keys, and needs to run standalone via `npx tsx scripts/test-pdf.mts`
// outside of Next's bundler, where the server-only guard throws unconditionally.
import fs from "node:fs";
import path from "node:path";
import * as mupdf from "mupdf";
import sharp from "sharp";
import type { NameMask } from "@/lib/types";

const DPI = 150;
const POINTS_PER_INCH = 72;
const SCALE = DPI / POINTS_PER_INCH;

/**
 * Rasterizes every page of a PDF to a PNG (~150 DPI) in outDir.
 * Returns the ordered list of PNG file paths (one per page, 1-indexed filenames).
 */
/** Number of pages in a PDF, without rendering any of them. */
export function pdfPageCount(pdfPath: string): number {
  const doc = mupdf.Document.openDocument(pdfPath) as mupdf.PDFDocument;
  return doc.countPages();
}

/**
 * Renders a single page of a PDF to `outPath`, creating the directory as
 * needed. Used for previews, where rasterizing a whole paper to show one page
 * would be wasteful.
 */
export function rasterizePdfPage(pdfPath: string, pageNumber: number, outPath: string): void {
  const doc = mupdf.Document.openDocument(pdfPath) as mupdf.PDFDocument;
  if (pageNumber < 1 || pageNumber > doc.countPages()) {
    throw new Error(`rasterizePdfPage: page ${pageNumber} is out of range`);
  }
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const page = doc.loadPage(pageNumber - 1);
  const pixmap = page.toPixmap(mupdf.Matrix.scale(SCALE, SCALE), mupdf.ColorSpace.DeviceRGB, false);
  fs.writeFileSync(outPath, pixmap.asPNG());
}

export async function rasterizePdf(pdfPath: string, outDir: string): Promise<string[]> {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const doc = mupdf.Document.openDocument(pdfPath) as mupdf.PDFDocument;
  const pageCount = doc.countPages();
  const matrix = mupdf.Matrix.scale(SCALE, SCALE);
  const outputPaths: string[] = [];

  for (let i = 0; i < pageCount; i++) {
    const page = doc.loadPage(i);
    const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false);
    const png = pixmap.asPNG();
    const outPath = path.join(outDir, `page-${i + 1}.png`);
    fs.writeFileSync(outPath, png);
    outputPaths.push(outPath);
  }

  return outputPaths;
}

/**
 * Composites an opaque black rectangle over the fractional region described by `mask`
 * (fractions of the page's width/height) and writes the result to outPath.
 * Used on page 1 before any cloud upload, to keep the handwritten student name local.
 */
export async function applyNameMask(
  pngPath: string,
  mask: NameMask,
  outPath: string
): Promise<void> {
  const image = sharp(pngPath);
  const metadata = await image.metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height) {
    throw new Error(`applyNameMask: could not read image dimensions for ${pngPath}`);
  }

  const rectLeft = Math.round(mask.x * width);
  const rectTop = Math.round(mask.y * height);
  const rectWidth = Math.max(1, Math.round(mask.w * width));
  const rectHeight = Math.max(1, Math.round(mask.h * height));

  const blackRect = await sharp({
    create: {
      width: rectWidth,
      height: rectHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  await image
    .composite([{ input: blackRect, left: rectLeft, top: rectTop }])
    .png()
    .toFile(outPath);
}
