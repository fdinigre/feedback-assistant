import type { AssessmentRow, LevelBand } from "@/lib/types";

export const LEVEL_BANDS: LevelBand[] = ["1-2", "3-4", "5-6", "7-8"];

/** Parses a level band string ("5-6") into its [low, high] numeric levels. */
export function bandLevels(band: LevelBand): [number, number] {
  const [low, high] = band.split("-").map(Number);
  return [low, high];
}

/**
 * Whether an assessment is marked on point thresholds at all.
 *
 * Only Criterion A is: its level follows from the points scored within each
 * band. B, C and D are rubric judgements on the written work, so a task that
 * carries none of A's point arithmetic (a Criterion B task, a Financial Math
 * test — criteria []) needs no thresholds and must not be held in setup
 * waiting for them.
 */
export function usesLevelThresholds(
  assessment: Pick<AssessmentRow, "criteria">
): boolean {
  return assessment.criteria.includes("A");
}
