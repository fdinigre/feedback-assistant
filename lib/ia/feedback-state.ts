// Whether a draft feedback's criteria and its math check are in step. The criteria
// (B and E above all) are written using the math check, so a check run again
// afterwards, or no check at all, leaves them out of date. Pure: the student page,
// the class page and the PDF all use it.

import type { IaDraftFeedback } from "@/lib/types";

export type MathState =
  | "ok" // the criteria were written with this math check (or there are no criteria yet)
  | "math-newer" // the math check was run again after the criteria were written
  | "no-math"; // the criteria were written without a math check

/** SQLite's "2026-11-02 08:15:00" (UTC) as a comparable ISO string. */
function sqliteToIso(t: string): string {
  return /T/.test(t) ? t : `${t.replace(" ", "T")}Z`;
}

export function feedbackMathState(fb: IaDraftFeedback | null | undefined, rowCreatedAt?: string): MathState {
  if (!fb || (fb.criteria?.length ?? 0) === 0) return "ok";
  const checkedAt = fb.mathCheck?.checkedAt ?? null;
  if (fb.generatedAt !== undefined) {
    const used = fb.mathCheckedAtGeneration ?? null;
    if (checkedAt && checkedAt !== used) return "math-newer";
    if (!fb.mathCheck) return "no-math";
    return "ok";
  }
  // Feedback from before this was recorded: compare with when its row was created.
  if (!fb.mathCheck) return "no-math";
  if (checkedAt && rowCreatedAt && new Date(checkedAt).getTime() > new Date(sqliteToIso(rowCreatedAt)).getTime() + 60_000) {
    return "math-newer";
  }
  return "ok";
}

export const MATH_STATE_TEXT: Record<Exclude<MathState, "ok">, string> = {
  "math-newer":
    "The math check is newer than this feedback, so criteria B and E were judged without it. Regenerate the feedback to bring them in line.",
  "no-math":
    "This feedback was written without a math check, so criteria B and E were judged on the text alone. Run the math check, then regenerate the feedback.",
};
