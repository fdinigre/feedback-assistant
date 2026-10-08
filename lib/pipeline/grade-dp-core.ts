import type { GradeBoundary } from "@/lib/types";

/**
 * Pure IBDP grade-boundary lookup: percentage -> grade 1-7.
 *
 * Rule (spec P10/P6, edge case "cutoff exactly on a boundary"): among all
 * boundaries whose minPct is <= pct (the floor of each band is inclusive),
 * the highest grade wins. A percentage exactly on a floor belongs to the
 * band above, never the one below.
 *
 * If pct falls below every boundary's floor (e.g. boundaries only start at
 * minPct > 0 and pct is lower still), returns the lowest grade defined so
 * there is always a result; with no boundaries at all, returns 1.
 */
export function computeDpGrade(pct: number, boundaries: GradeBoundary[]): number {
  const eligible = boundaries.filter((b) => pct >= b.minPct);
  if (eligible.length === 0) {
    return boundaries.length > 0 ? Math.min(...boundaries.map((b) => b.grade)) : 1;
  }
  return Math.max(...eligible.map((b) => b.grade));
}

/*
 * Desk-check (mesa) tests — illustrative boundary table, not real IB values:
 *
 *   const boundaries: GradeBoundary[] = [
 *     { grade: 1, minPct: 0 },
 *     { grade: 2, minPct: 20 },
 *     { grade: 3, minPct: 35 },
 *     { grade: 4, minPct: 50 },
 *     { grade: 5, minPct: 63 },
 *     { grade: 6, minPct: 75 },
 *     { grade: 7, minPct: 87 },
 *   ];
 *
 *   computeDpGrade(0, boundaries)      -> 1   (floor of band 1)
 *   computeDpGrade(19.9, boundaries)   -> 1   (just under band 2's floor)
 *   computeDpGrade(20, boundaries)     -> 2   (exactly on floor -> band above, inclusive)
 *   computeDpGrade(34.999, boundaries) -> 2
 *   computeDpGrade(87, boundaries)     -> 7   (exactly on top floor)
 *   computeDpGrade(100, boundaries)    -> 7
 *   computeDpGrade(63, boundaries)     -> 5   (inclusive floor, not 4)
 *   computeDpGrade(-5, boundaries)     -> 1   (below every floor -> lowest grade defined)
 *   computeDpGrade(50, [])             -> 1   (no boundaries at all -> default 1)
 */
