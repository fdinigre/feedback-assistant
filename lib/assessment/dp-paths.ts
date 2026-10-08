import "server-only";

import fs from "node:fs";
import path from "node:path";

import { toStoredPath } from "./file-paths";

const DP_DATA_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "dp");

/** data/dp/<assessmentId>/ — uploaded paper + markscheme, examiner instructions, parse marker. */
export function dpDir(assessmentId: number): string {
  return path.join(DP_DATA_DIR, String(assessmentId));
}

export function ensureDpDir(assessmentId: number): string {
  const dir = dpDir(assessmentId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Fixed contract path — the (separate) DP grading engine reads Instructions to
 * Examiners text from exactly this location when the markscheme included those pages. */
export function examinerInstructionsPath(assessmentId: number): string {
  return path.join(dpDir(assessmentId), "examiner-instructions.txt");
}

/** Marker file recording that the teacher has reviewed and approved the markscheme parse. */
export function parseApprovedMarkerPath(assessmentId: number): string {
  return path.join(dpDir(assessmentId), "parse-approved.json");
}

export function isParseApproved(assessmentId: number): boolean {
  return fs.existsSync(parseApprovedMarkerPath(assessmentId));
}

export function markParseApproved(assessmentId: number): void {
  ensureDpDir(assessmentId);
  fs.writeFileSync(
    parseApprovedMarkerPath(assessmentId),
    JSON.stringify({ approvedAt: new Date().toISOString() }, null, 2),
    "utf-8"
  );
}

/** Clears the approval marker — used whenever the parse changes (re-run or manual edit). */
export function clearParseApproved(assessmentId: number): void {
  const p = parseApprovedMarkerPath(assessmentId);
  if (fs.existsSync(p)) fs.rmSync(p);
}

/**
 * Saves an uploaded file (paper|markscheme) under data/dp/<assessmentId>/, replacing
 * any previous file of the same kind (any extension) so re-uploads don't accumulate.
 */
export function saveDpFile(
  assessmentId: number,
  kind: "paper" | "markscheme",
  originalName: string,
  bytes: Buffer
): string {
  const dir = ensureDpDir(assessmentId);
  for (const existing of fs.readdirSync(dir)) {
    if (existing.startsWith(`${kind}.`)) {
      fs.rmSync(path.join(dir, existing));
    }
  }
  const ext = path.extname(originalName).toLowerCase() || ".pdf";
  const dest = path.join(dir, `${kind}${ext}`);
  fs.writeFileSync(dest, bytes);
  // Relative, so the row survives the project folder being moved or copied.
  return toStoredPath(dest);
}
