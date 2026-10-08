import type { Criterion } from "@/lib/types";

export const ALL_CRITERIA: Criterion[] = ["A", "B", "C", "D"];

/**
 * Criterion C is always assessed alongside another criterion — it can never
 * stand alone on an assessment. Returns an error message, or null if valid.
 */
export function validateCriteria(criteria: Criterion[]): string | null {
  if (criteria.length === 0) {
    return "Select at least one criterion.";
  }
  if (criteria.includes("C") && criteria.length < 2) {
    return "Criterion C can never be selected alone — pair it with another criterion (A, B, or D).";
  }
  return null;
}
