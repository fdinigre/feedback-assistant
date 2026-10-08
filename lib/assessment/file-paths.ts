import "server-only";

import fs from "node:fs";
import path from "node:path";

/**
 * Uploaded papers and markschemes are stored under data/, and the database
 * records where. Those records used to be absolute paths built from
 * process.cwd() at upload time, which breaks the moment the project folder is
 * moved or renamed, or the data/ folder is carried to the other Mac — the file
 * is still there, but the row points at a directory that no longer exists, and
 * the parse fails with "file not found on disk".
 *
 * Paths are now stored relative to the project folder. These helpers keep old
 * absolute rows working, so nothing has to be re-uploaded.
 */

/** Project-relative form of an absolute path under the project folder. */
export function toStoredPath(absolutePath: string): string {
  const relative = path.relative(process.cwd(), absolutePath);
  // A path outside the project (shouldn't happen) is kept as-is rather than
  // turned into a ../../ chain that would be meaningless elsewhere.
  return relative.startsWith("..") ? absolutePath : relative;
}

/**
 * Absolute path for a stored value, or null when the file genuinely isn't
 * there. Handles three cases: a relative path (current format), an absolute
 * path that still resolves, and an absolute path written before the folder
 * moved — for which the portion from "data/" onwards is re-rooted at the
 * project folder.
 */
export function resolveStoredPath(stored: string | null): string | null {
  if (!stored) return null;

  if (!path.isAbsolute(stored)) {
    const resolved = path.join(process.cwd(), stored);
    return fs.existsSync(resolved) ? resolved : null;
  }

  if (fs.existsSync(stored)) return stored;

  const marker = `${path.sep}data${path.sep}`;
  const index = stored.lastIndexOf(marker);
  if (index === -1) return null;

  const rerooted = path.join(process.cwd(), stored.slice(index + 1));
  return fs.existsSync(rerooted) ? rerooted : null;
}

/** For messages: what the teacher should recognise, not an absolute path. */
export function displayStoredPath(stored: string | null): string {
  if (!stored) return "";
  return path.isAbsolute(stored) ? toStoredPath(stored) : stored;
}

/**
 * The blank exam paper for an assessment.
 *
 * Prefers the recorded path, but falls back to the conventional location on
 * disk. MYP uploads saved the paper without ever recording it, so assessments
 * set up before that was fixed have the file sitting in data/papers/<id>/ with
 * nothing pointing at it — and asking a teacher to re-upload a paper to fix a
 * bookkeeping bug would be a poor trade.
 */
export function findAssessmentPaper(
  assessmentId: number,
  storedPaperFile: string | null
): string | null {
  const recorded = resolveStoredPath(storedPaperFile);
  if (recorded) return recorded;

  for (const dir of ["papers", "dp"]) {
    for (const ext of [".pdf", ".docx"]) {
      const candidate = path.join(process.cwd(), "data", dir, String(assessmentId), `paper${ext}`);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}
