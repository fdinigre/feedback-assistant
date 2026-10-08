import "server-only";

import { listSubmissions, updateSubmission } from "@/lib/db/queries";
import type { SubmissionRow } from "@/lib/types";

const PAGE_COUNT_WARNING_PREFIX = "Has ";
const NAME_MASK_WARNING = "No name mask configured for this assessment — page 1 not masked for AI upload.";

/** Returns the most common value in `counts`, ties broken by the smallest value. Empty input → null. */
export function computeModalPageCount(counts: number[]): number | null {
  if (counts.length === 0) return null;
  const frequency = new Map<number, number>();
  for (const c of counts) {
    frequency.set(c, (frequency.get(c) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestFreq = -1;
  for (const [value, freq] of frequency) {
    if (freq > bestFreq || (freq === bestFreq && (best === null || value < best))) {
      best = value;
      bestFreq = freq;
    }
  }
  return best;
}

function isPageCountWarning(w: string): boolean {
  return w.startsWith(PAGE_COUNT_WARNING_PREFIX) && w.includes("most of the batch has");
}

/**
 * Recomputes the page-count sanity warning across all non-absent submissions with a
 * known page count in this assessment (spec F: batch intake, page-count sanity check).
 * Only touches the "Has N pages..." warning; other warnings (e.g. missing name mask)
 * are preserved.
 */
export function recomputePageCountWarnings(assessmentId: number): void {
  const submissions = listSubmissions(assessmentId);
  const relevant = submissions.filter(
    (s): s is SubmissionRow & { page_count: number } =>
      s.status !== "absent" && s.page_count !== null && s.page_count !== undefined
  );

  const modal = relevant.length >= 3 ? computeModalPageCount(relevant.map((s) => s.page_count)) : null;

  for (const s of relevant) {
    const others = (s.warnings ?? []).filter((w) => !isPageCountWarning(w));
    const nextWarnings =
      modal !== null && s.page_count !== modal
        ? [
            ...others,
            `Has ${s.page_count} pages; most of the batch has ${modal} — check for a missing/extra scan page`,
          ]
        : others;

    const changed =
      nextWarnings.length !== (s.warnings ?? []).length ||
      nextWarnings.some((w, i) => w !== (s.warnings ?? [])[i]);
    if (changed) {
      updateSubmission(s.id, { warnings: nextWarnings.length > 0 ? nextWarnings : null });
    }
  }
}

/** Adds (or keeps) the "no name mask configured" warning on a freshly-uploaded submission. */
export function warningsForMissingNameMask(existing: string[] | null): string[] {
  const others = (existing ?? []).filter((w) => w !== NAME_MASK_WARNING);
  return [...others, NAME_MASK_WARNING];
}

/**
 * Drops the "no name mask configured" warning, keeping every other warning.
 * The warning is recorded at upload time, but a mask configured later goes back
 * and masks the already-uploaded scans — at which point the warning is stale and
 * would otherwise claim, wrongly and permanently, that page 1 is unmasked.
 */
export function warningsWithoutMissingNameMask(existing: string[] | null): string[] {
  return (existing ?? []).filter((w) => w !== NAME_MASK_WARNING);
}

/**
 * Clears the stale "no name mask configured" warning from every submission in
 * an assessment. Called after masks are saved and re-applied to earlier uploads.
 */
export function clearMissingNameMaskWarnings(assessmentId: number): void {
  for (const s of listSubmissions(assessmentId)) {
    if (!(s.warnings ?? []).includes(NAME_MASK_WARNING)) continue;
    const next = warningsWithoutMissingNameMask(s.warnings ?? null);
    updateSubmission(s.id, { warnings: next.length > 0 ? next : null });
  }
}

/**
 * Groups non-absent, assigned submissions by student_id and returns the set of
 * submission ids that share a student with at least one other submission
 * (spec edge case: two PDFs assigned to the same student).
 */
export function findDuplicateSubmissionIds(submissions: SubmissionRow[]): Set<number> {
  const byStudent = new Map<number, number[]>();
  for (const s of submissions) {
    if (s.status === "absent" || s.student_id === null) continue;
    const list = byStudent.get(s.student_id) ?? [];
    list.push(s.id);
    byStudent.set(s.student_id, list);
  }
  const duplicates = new Set<number>();
  for (const ids of byStudent.values()) {
    if (ids.length > 1) {
      for (const id of ids) duplicates.add(id);
    }
  }
  return duplicates;
}
