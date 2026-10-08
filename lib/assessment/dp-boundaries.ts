import type { GradeBoundary } from "@/lib/types";
import { listAssessments } from "@/lib/db/queries";

/**
 * Validates a DP grade-boundary table (spec P6): exactly 7 bands, grades 1-7 each present
 * once, strictly increasing minPct, and grade 1's floor at 0 (every percentage must land in
 * some band). Returns an error message, or null if valid.
 */
export function validateBoundaries(boundaries: GradeBoundary[]): string | null {
  if (boundaries.length !== 7) {
    return "Boundaries must have exactly 7 bands (grades 1-7).";
  }
  const sorted = [...boundaries].sort((a, b) => a.grade - b.grade);
  for (let i = 0; i < 7; i++) {
    if (sorted[i].grade !== i + 1) {
      return "Boundaries must cover grades 1 through 7, each exactly once.";
    }
  }
  if (sorted[0].minPct !== 0) {
    return "Grade 1's floor must be 0% (every percentage must fall in some band).";
  }
  for (let i = 1; i < 7; i++) {
    if (!(sorted[i].minPct > sorted[i - 1].minPct)) {
      return `Grade ${sorted[i].grade}'s floor (${sorted[i].minPct}%) must be greater than grade ${sorted[i - 1].grade}'s floor (${sorted[i - 1].minPct}%) — floors must strictly increase.`;
    }
  }
  for (const b of boundaries) {
    if (!Number.isFinite(b.minPct) || b.minPct < 0 || b.minPct > 100) {
      return "Boundary percentages must be between 0 and 100.";
    }
  }
  return null;
}

/**
 * Default boundary table for a new DP assessment's setup form: the boundaries from the most
 * recently created OTHER DP assessment that has a valid table set (spec P6: "muda pouco —
 * pré-preencher com a tabela da última avaliação DP").
 */
export function getDefaultDpBoundaries(excludeAssessmentId: number): GradeBoundary[] | null {
  const candidates = listAssessments().filter(
    (a) => a.programme === "DP" && a.id !== excludeAssessmentId && a.boundaries !== null
  );
  for (const candidate of candidates) {
    if (candidate.boundaries && validateBoundaries(candidate.boundaries) === null) {
      return candidate.boundaries;
    }
  }
  return null;
}
