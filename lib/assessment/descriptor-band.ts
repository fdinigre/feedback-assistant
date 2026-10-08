import type { LevelBand } from "@/lib/types";
import { LEVEL_BANDS, bandLevels } from "./bands";

// What the ticked descriptors imply about the level, by the teacher's own rule.
// A leaf module with no "server-only": the review panel and the report both show
// this, and they must show the same number.
//
// Her rule, in her words: a band descriptor covers two levels. Everything in that
// band met is the UPPER level; half or more of it is the LOWER one. If a band is
// only partly met but something from a higher band is met, that may balance out to
// the upper level — or may not, which is a judgement, not arithmetic. So this
// reports the balance rather than resolving it, and nothing here is ever written
// to the level: the teacher sets that, and the grader argues for it in words.

export type DescriptorTick = { band: LevelBand; met: boolean };

export type BandCount = { met: number; total: number };

export type LevelSuggestion = {
  /** The highest band at least half met, or null when none is. */
  band: LevelBand | null;
  /** The level that band implies: its upper level when fully met, else its lower. */
  level: number;
  /** Whether every statement in that band is met. */
  allMet: boolean;
  /** Statements met in bands ABOVE the achieved one — the "might balance up" case. */
  higherMet: number;
  /** True when a partly-met band is carrying met statements from a higher one. */
  couldBalanceUp: boolean;
  countsByBand: Record<LevelBand, BandCount>;
};

export function suggestLevel(ticks: DescriptorTick[]): LevelSuggestion {
  const countsByBand = Object.fromEntries(
    LEVEL_BANDS.map((band) => [band, { met: 0, total: 0 }])
  ) as Record<LevelBand, BandCount>;

  for (const tick of ticks) {
    const count = countsByBand[tick.band];
    if (!count) continue;
    count.total++;
    if (tick.met) count.met++;
  }

  // "Half or more" of a band's own statements is what reaches it at all.
  const reached = (band: LevelBand) => {
    const { met, total } = countsByBand[band];
    return total > 0 && met * 2 >= total;
  };

  let achievedIndex = -1;
  for (let i = 0; i < LEVEL_BANDS.length; i++) {
    if (reached(LEVEL_BANDS[i])) achievedIndex = i;
  }

  if (achievedIndex === -1) {
    const higherMet = LEVEL_BANDS.reduce((sum, band) => sum + countsByBand[band].met, 0);
    return {
      band: null,
      level: 0,
      allMet: false,
      higherMet,
      couldBalanceUp: false,
      countsByBand,
    };
  }

  const band = LEVEL_BANDS[achievedIndex];
  const [lower, upper] = bandLevels(band);
  const { met, total } = countsByBand[band];
  const allMet = met === total;
  const higherMet = LEVEL_BANDS.slice(achievedIndex + 1).reduce(
    (sum, b) => sum + countsByBand[b].met,
    0
  );

  return {
    band,
    level: allMet ? upper : lower,
    allMet,
    higherMet,
    couldBalanceUp: !allMet && higherMet > 0,
    countsByBand,
  };
}

/** One line of the suggestion, as the review panel and the report both phrase it. */
export function describeSuggestion(suggestion: LevelSuggestion): string {
  if (suggestion.band === null) return "ticks reach no band yet";
  const base = `ticks suggest ${suggestion.level}`;
  if (!suggestion.couldBalanceUp) return base;
  const [, upper] = bandLevels(suggestion.band);
  const n = suggestion.higherMet;
  return `${base} — could balance to ${upper} (${n} statement${n === 1 ? "" : "s"} met above ${suggestion.band})`;
}
