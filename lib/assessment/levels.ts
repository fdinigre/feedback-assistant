import type { LevelThresholdRow } from "@/lib/types";

// Criterion A's level follows from the marks alone — no AI judgement — so this
// lives in a leaf module. The marking pipeline and the marks-sheet import both
// need it, and the import must not pull the AI client in behind it.

// The teacher's markscheme practice: each level's threshold is the minimum points
// scored WITHIN that level's band section (e.g. level 6 requires 9-14 points on the
// 5-6 band questions), not a cut on the assessment total. The final level is the
// highest level whose own band-section points meet its threshold.
const BAND_OF_LEVEL: Record<number, string> = {
  1: "1-2", 2: "1-2", 3: "3-4", 4: "3-4", 5: "5-6", 6: "5-6", 7: "7-8", 8: "7-8",
};

const BAND_ORDER = ["1-2", "3-4", "5-6", "7-8"];
const UPPER_OF_BAND: Record<string, number> = { "1-2": 2, "3-4": 4, "5-6": 6, "7-8": 8 };

// Teacher's standing rules (confirmed 2026-07-14), valid for every assessment:
// 1. Floor of 1: a student only gets level 0 with zero points everywhere.
// 2. Skipped-band penalty: final level = highest level achieved in any band,
//    minus 1 for each EARLIER band where the student did NOT reach that band's
//    UPPER level. "Not reaching the upper level" covers both a fully-failed band
//    and one where only the lower level was reached. Examples she gave:
//      - reached 6 via band 5-6, failed band 3-4 entirely      -> 6 - 1 = 5
//      - reached 5 via band 5-6, only level 3 in band 3-4 (not 4) -> 5 - 1 = 4
export function computeLevel(
  pointsByBand: Map<string, number>,
  thresholds: LevelThresholdRow[]
): number {
  const totalPoints = [...pointsByBand.values()].reduce((a, b) => a + b, 0);
  if (totalPoints <= 0) return 0;

  // Highest level achieved within each band (absent/0 = band's lower level not reached).
  const achieved = new Map<string, number>();
  for (const t of [...thresholds].sort((a, b) => b.level - a.level)) {
    const band = BAND_OF_LEVEL[t.level] ?? "";
    if (!achieved.has(band) && (pointsByBand.get(band) ?? 0) >= t.min_points) {
      achieved.set(band, t.level);
    }
  }

  let best = 0;
  let bestBandIdx = -1;
  for (let i = 0; i < BAND_ORDER.length; i++) {
    const lvl = achieved.get(BAND_ORDER[i]) ?? 0;
    if (lvl >= best && lvl > 0) {
      best = lvl;
      bestBandIdx = i;
    }
  }
  if (best === 0) return 1; // has points but reached no band's lower level -> floor of 1

  // Lose one level for every earlier band whose UPPER level was not reached.
  let penalty = 0;
  for (let i = 0; i < bestBandIdx; i++) {
    const band = BAND_ORDER[i];
    if ((achieved.get(band) ?? 0) !== UPPER_OF_BAND[band]) penalty++;
  }
  return Math.max(1, best - penalty);
}
