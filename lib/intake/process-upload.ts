import "server-only";

import fs from "node:fs";
import path from "node:path";
import { rasterizePdf, applyNameMask } from "@/lib/pdf";
import { getAssessment, insertSubmission, updateSubmission, deleteSubmission } from "@/lib/db/queries";
import { pagesDir, uniqueFilePath, uploadsDir } from "@/lib/intake/paths";
import { warningsForMissingNameMask } from "@/lib/intake/batch";
import type { SubmissionRow } from "@/lib/types";

export type ProcessUploadResult =
  | { filename: string; ok: true; submission: SubmissionRow }
  | { filename: string; ok: false; error: string };

/**
 * Saves one uploaded PDF, rasterizes every page, applies the assessment's name mask
 * to page 1, and records the submission row. On failure (corrupt/unreadable PDF),
 * rolls back any partial DB row/files and returns a per-file error — callers should
 * keep processing the rest of the batch (spec edge case: PDF unreadable / corrupt scan).
 */
export async function processUploadedPdf(
  assessmentId: number,
  originalName: string,
  bytes: Buffer
): Promise<ProcessUploadResult> {
  const assessment = getAssessment(assessmentId);
  if (!assessment) {
    return { filename: originalName, ok: false, error: "Assessment not found." };
  }

  const savedPath = uniqueFilePath(uploadsDir(assessmentId), originalName);
  let submission: SubmissionRow | undefined;

  try {
    fs.writeFileSync(savedPath, bytes);

    submission = insertSubmission({
      assessment_id: assessmentId,
      pdf_path: savedPath,
      status: "uploaded",
    });

    const outDir = pagesDir(submission.id);
    const pngPaths = await rasterizePdf(savedPath, outDir);
    if (pngPaths.length === 0) {
      throw new Error("PDF has no pages.");
    }

    let warnings: string[] | null = null;
    if (assessment.name_masks.length > 0) {
      // Apply every configured mask to its own page (page 1 required; page 2+ optional).
      for (const mask of assessment.name_masks) {
        const src = path.join(outDir, `page-${mask.page}.png`);
        if (!fs.existsSync(src)) continue; // scan may have fewer pages than the template
        const maskedPath = path.join(outDir, `page-${mask.page}-masked.png`);
        await applyNameMask(src, mask, maskedPath);
      }
    } else {
      warnings = warningsForMissingNameMask(null);
    }

    const updated = updateSubmission(submission.id, {
      page_count: pngPaths.length,
      warnings,
    });

    return { filename: originalName, ok: true, submission: updated! };
  } catch (err) {
    // Roll back partial state so a corrupt file doesn't leave orphaned rows/dirs.
    if (submission) {
      try {
        fs.rmSync(pagesDir(submission.id), { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
      deleteSubmission(submission.id);
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      filename: originalName,
      ok: false,
      error: `Could not read "${originalName}" — it may be corrupt or not a valid PDF (${message}).`,
    };
  }
}
