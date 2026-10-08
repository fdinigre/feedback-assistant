/**
 * Manual smoke test for lib/pdf.ts — generates a small sample PDF (no external
 * fixture needed), rasterizes it, and applies a name mask to page 1.
 *
 * Run with: npx tsx scripts/test-pdf.ts
 */
import fs from "node:fs";
import path from "node:path";
import * as mupdf from "mupdf";
import { rasterizePdf, applyNameMask } from "../lib/pdf";
import type { NameMask } from "../lib/types";

const SCRATCH_DIR = path.join(process.cwd(), "data", "test-pdf-scratch");
const SAMPLE_PDF = path.join(SCRATCH_DIR, "sample.pdf");
const RASTER_DIR = path.join(SCRATCH_DIR, "pages");
const MASKED_PATH = path.join(SCRATCH_DIR, "page-1-masked.png");

function buildSamplePdf(): void {
  const doc = new mupdf.PDFDocument();
  const mediabox: mupdf.Rect = [0, 0, 612, 792]; // US Letter, in points

  // Page 1: draw a black square in the top-left, standing in for a handwritten name.
  const page1Content = Buffer.from(
    "0 0 0 rg 40 700 200 50 re f 20 20 100 100 re S",
    "utf-8"
  );
  const page1 = doc.addPage(mediabox, 0, {}, page1Content);
  doc.insertPage(0, page1);

  // Page 2: a different simple mark, so we can confirm both pages rasterize.
  const page2Content = Buffer.from("0 0 0 rg 40 40 300 20 re f", "utf-8");
  const page2 = doc.addPage(mediabox, 0, {}, page2Content);
  doc.insertPage(1, page2);

  doc.save(SAMPLE_PDF);
}

async function main() {
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });

  console.log("1. Building sample 2-page PDF...");
  buildSamplePdf();
  console.log(`   -> ${SAMPLE_PDF}`);

  console.log("2. Rasterizing PDF to PNG (~150 DPI)...");
  const pngPaths = await rasterizePdf(SAMPLE_PDF, RASTER_DIR);
  console.log(`   -> ${pngPaths.length} page(s): ${pngPaths.join(", ")}`);
  if (pngPaths.length !== 2) {
    throw new Error(`Expected 2 rasterized pages, got ${pngPaths.length}`);
  }
  for (const p of pngPaths) {
    if (!fs.existsSync(p) || fs.statSync(p).size === 0) {
      throw new Error(`Rasterized page missing or empty: ${p}`);
    }
  }

  console.log("3. Applying name mask to page 1...");
  const mask: NameMask = { page: 1, x: 0.05, y: 0.05, w: 0.4, h: 0.1 };
  await applyNameMask(pngPaths[0], mask, MASKED_PATH);
  if (!fs.existsSync(MASKED_PATH) || fs.statSync(MASKED_PATH).size === 0) {
    throw new Error(`Masked output missing or empty: ${MASKED_PATH}`);
  }
  console.log(`   -> ${MASKED_PATH}`);

  console.log("\nPDF utilities test PASSED.");
}

main().catch((err) => {
  console.error("\nPDF utilities test FAILED:");
  console.error(err);
  process.exit(1);
});
