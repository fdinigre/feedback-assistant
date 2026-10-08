/**
 * Shared upload ceiling for setup files (exam paper, markscheme, worked
 * solutions). These go through Server Actions, whose body limit is enforced by
 * Next.js before any of our code runs — so exceeding it produces a bare 500
 * page with no explanation. The components check against this first to turn
 * that into a sentence a person can act on.
 *
 * Must stay in step with serverActions.bodySizeLimit in next.config.ts.
 *
 * A scanned markscheme at high resolution can run to tens of megabytes; a
 * digitally produced one is usually a few. The ceiling is set well above the
 * scanned case because re-scanning a paper to fit an arbitrary limit is a
 * miserable way to spend an evening.
 */
export const MAX_UPLOAD_MB = 150;

export function fileSizeMb(bytes: number): number {
  return bytes / (1024 * 1024);
}

/** A message when the file is too big, or null when it's fine. */
export function tooLargeMessage(file: File): string | null {
  const mb = fileSizeMb(file.size);
  if (mb <= MAX_UPLOAD_MB) return null;
  return (
    `"${file.name}" is ${mb.toFixed(0)} MB, over the ${MAX_UPLOAD_MB} MB limit. ` +
    `If it's a scan, re-export it at a lower resolution (150 dpi is plenty to read) and try again.`
  );
}
