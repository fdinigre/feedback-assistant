/**
 * How hard Gemini thinks, chosen per kind of work and editable in Settings.
 *
 * Measured on a real four-page handwritten paper: High took about 6 minutes,
 * Medium about 4, and both read every answer the same way — except that only
 * High noticed a crossed-out word, which matters because crossed-out work earns
 * nothing. So reading and marking student work defaults to High, and setup
 * (proposing questions and answer keys from a blank test, which the teacher
 * reviews line by line anyway) defaults to Medium.
 *
 * Anything not listed as setup counts as student work: a new kind of request
 * gets the careful setting until someone decides otherwise.
 *
 * No imports: the Settings form uses the labels and choices too.
 */

export const EFFORTS = ["low", "medium", "high"] as const;
export type Effort = (typeof EFFORTS)[number];

export type EffortKind = "studentWork" | "setup";

export const EFFORT_DEFAULTS: Record<EffortKind, Effort> = {
  studentWork: "high",
  setup: "medium",
};

/** The app_settings key each one is stored under. */
export const EFFORT_SETTING_KEY: Record<EffortKind, string> = {
  studentWork: "gemini_effort_student_work",
  setup: "gemini_effort_setup",
};

/** Requests made while setting an assessment up, from the blank test and keys. */
const SETUP_PURPOSES = new Set([
  "myp-paper-vision",
  "myp-paper-extract",
  "myp-worked-solutions-vision",
  "fm-propose-key",
  "ms-parse",
  "dp-match-targets",
  "dp-cover-targets",
]);

export function effortKindOf(purpose: string): EffortKind {
  return SETUP_PURPOSES.has(purpose) ? "setup" : "studentWork";
}

export function parseEffort(value: unknown): Effort | null {
  return typeof value === "string" && (EFFORTS as readonly string[]).includes(value)
    ? (value as Effort)
    : null;
}
