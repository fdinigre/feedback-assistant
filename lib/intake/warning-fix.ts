/**
 * Where a submission warning gets settled. Warnings are stored as sentences, so
 * this reads them back: a missing name mask and sub-parts the questions do not
 * define are both fixed in the assessment's setup; a question missing from the
 * scan, or read as sub-parts, is a look at the paper itself.
 *
 * No imports, because the review pages that show these are client components.
 */
export type WarningFix = {
  href: string;
  label: string;
  /** True when the fix is on the paper — no link needed when you are already on it. */
  onPaper: boolean;
};

export function warningFix(warning: string, assessmentId: number, submissionId: number): WarningFix {
  if (/name mask/i.test(warning)) {
    return { href: `/assessments/${assessmentId}/setup`, label: "Set the name mask in Setup", onPaper: false };
  }
  if (/define sub-part questions/i.test(warning)) {
    return { href: `/assessments/${assessmentId}/setup`, label: "Define the questions in Setup", onPaper: false };
  }
  return { href: `/submissions/${submissionId}`, label: "Open the paper", onPaper: true };
}
