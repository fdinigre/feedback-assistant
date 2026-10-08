import "server-only";

import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "data");

/** data/uploads/<assessmentId>/ — original PDFs, one per student. */
export function uploadsDir(assessmentId: number): string {
  return path.join(DATA_DIR, "uploads", String(assessmentId));
}

/** data/pages/<submissionId>/ — rasterized page PNGs for a submission. */
export function pagesDir(submissionId: number): string {
  return path.join(DATA_DIR, "pages", String(submissionId));
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Returns a filesystem-safe path for saving `originalName` inside `dir`, adding a
 * numeric suffix (e.g. "test-2.pdf") if a file with that name already exists.
 */
export function uniqueFilePath(dir: string, originalName: string): string {
  ensureDir(dir);
  const ext = path.extname(originalName);
  const base = path.basename(originalName, ext);
  let candidate = path.join(dir, originalName);
  let n = 1;
  while (fs.existsSync(candidate)) {
    n += 1;
    candidate = path.join(dir, `${base}-${n}${ext}`);
  }
  return candidate;
}

/** Matches page-N.png and page-N-masked.png filenames produced during rasterization. */
export const PAGE_FILENAME_PATTERN = /^page-\d+(-masked)?\.png$/;
