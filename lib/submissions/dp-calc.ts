// Pure DP (IBDP) mark-scoring helpers — no DB access, no "server-only". Used
// by both the client-side review UI (for live recompute on every toggle) and
// server-side code (API route, xlsx export) so the two never drift.
//
// A "mark" here is one line of the official markscheme (M1, (M1), A1, R1,
// ft, ...). `DpSchemeMark.value` (from the assessment's dp_scheme) carries
// how many points it's worth; `DpMarkAward` (from a submission's grading)
// carries whether it was awarded, for three possible passes:
//   - awarded              -> the AI's first-pass proposal
//   - conservativeAwarded  -> the AI's conservative second pass (can only
//                             lower marks vs. the proposal, per house rule)
//   - finalAwarded         -> the teacher's override from this review screen
//                             (falls back to conservativeAwarded until set)

import type { DpGradingQuestion, DpQuestionScheme, GradeBoundary } from "@/lib/types";
import { computeDpGrade } from "@/lib/pipeline/grade-dp-core";

export { computeDpGrade };

/** Flattens a question's markscheme into markId -> point value. */
export function buildMarkValueMap(scheme: DpQuestionScheme | null | undefined): Map<string, number> {
  const map = new Map<string, number>();
  if (!scheme || !Array.isArray(scheme.subparts)) return map;
  for (const subpart of scheme.subparts) {
    for (const mark of subpart.marks ?? []) {
      map.set(mark.id, mark.value);
    }
  }
  return map;
}

type AwardLike = { markId: string; awarded: boolean; conservativeAwarded: boolean; finalAwarded?: boolean };
type AwardPicker = (award: AwardLike) => boolean;

export const pickFinal: AwardPicker = (a) => a.finalAwarded ?? a.conservativeAwarded;
export const pickConservative: AwardPicker = (a) => a.conservativeAwarded;
export const pickProposed: AwardPicker = (a) => a.awarded;

/**
 * Sums the marks for one question's grading under a given pass (proposed/conservative/final).
 * Each sub-part is capped at its scheme max: a correct-answer mark (C1/C2/C3) is an ALTERNATIVE
 * to that sub-part's method/accuracy marks, so a scheme carrying both must never exceed maxMarks.
 */
export function sumQuestionMarks(
  content: DpGradingQuestion,
  scheme: DpQuestionScheme | null | undefined,
  pick: AwardPicker
): number {
  let total = 0;
  // Defensive: a malformed/legacy grading (e.g. one written by the MYP grader) has no
  // subparts — treat it as zero rather than crashing the whole review page.
  if (!content || !Array.isArray(content.subparts)) return total;
  const markValues = buildMarkValueMap(scheme);
  const maxByLabel = new Map((scheme?.subparts ?? []).map((sp) => [sp.label, sp.maxMarks]));
  for (const subpart of content.subparts) {
    let spTotal = 0;
    for (const award of subpart.awards ?? []) {
      if (pick(award)) {
        spTotal += markValues.get(award.markId) ?? 0;
      }
    }
    const cap = maxByLabel.get(subpart.label);
    total += cap != null ? Math.min(spTotal, cap) : spTotal;
  }
  return total;
}

/** Sums a whole submission across all its questions under a given pass. */
export function sumSubmissionMarks(
  questions: { id: number; max_points: number; dp_scheme: DpQuestionScheme | null }[],
  gradingByQuestionId: Map<number, DpGradingQuestion>,
  pick: AwardPicker
): { total: number; max: number } {
  let total = 0;
  let max = 0;
  for (const q of questions) {
    max += q.max_points;
    const content = gradingByQuestionId.get(q.id);
    if (!content) continue;
    total += sumQuestionMarks(content, q.dp_scheme, pick);
  }
  return { total, max };
}

export function pctOf(total: number, max: number): number {
  return max > 0 ? (total / max) * 100 : 0;
}

/** Convenience: live pct + grade for a submission under the "final" pass (what review screen shows). */
export function liveSubmissionStats(
  questions: { id: number; max_points: number; dp_scheme: DpQuestionScheme | null }[],
  gradingByQuestionId: Map<number, DpGradingQuestion>,
  boundaries: GradeBoundary[]
): { total: number; max: number; pct: number; grade: number; conservativeTotal: number } {
  const { total, max } = sumSubmissionMarks(questions, gradingByQuestionId, pickFinal);
  const { total: conservativeTotal } = sumSubmissionMarks(questions, gradingByQuestionId, pickConservative);
  const pct = pctOf(total, max);
  const grade = computeDpGrade(pct, boundaries);
  return { total, max, pct, grade, conservativeTotal };
}
