import "server-only";

import {
  getCriterionLevel,
  listGradings,
  listLevelThresholds,
  listQuestions,
  upsertCriterionLevel,
} from "@/lib/db/queries";
import { computeLevel } from "@/lib/assessment/levels";
import type { AssessmentRow } from "@/lib/types";

/**
 * Recomputes Criterion A from the marks now on file and records it as the
 * teacher's final level. Called whenever a mark changes — a saved edit on the
 * review page, "accept all", or an uploaded marks sheet — so the level on
 * record never lags behind the marks on record.
 *
 * Only A is derived this way. B and D are rubric judgements the AI makes from
 * the written work, and C is judged on communication — none of them follow from
 * per-question points, so changing marks must not silently rewrite them.
 */
export function recomputeCriterionA(
  assessment: AssessmentRow,
  submissionId: number,
  /** What changed the marks, for the evidence trail: "the uploaded marks sheet", "a mark you saved". */
  cause: string
): boolean {
  if (!assessment.criteria.includes("A")) return false;

  const questions = listQuestions(assessment.id);
  const bandByQuestion = new Map(questions.map((q) => [q.id, q.level_band]));
  const thresholds = listLevelThresholds(assessment.id);
  if (thresholds.length === 0) return false;

  const pointsByBand = new Map<string, number>();
  for (const grading of listGradings(submissionId)) {
    const band = bandByQuestion.get(grading.question_id);
    if (!band) continue;
    const points = grading.content.finalPoints ?? grading.content.conservativePoints;
    pointsByBand.set(band, (pointsByBand.get(band) ?? 0) + points);
  }

  const level = computeLevel(pointsByBand, thresholds);
  const existing = getCriterionLevel(submissionId, "A");
  if (!existing) return false;

  const breakdown = [...pointsByBand.entries()]
    .sort()
    .map(([band, pts]) => `${band}: ${pts}`)
    .join(", ");

  upsertCriterionLevel({
    submission_id: submissionId,
    criterion: "A",
    level_proposed: existing.level_proposed,
    level_conservative: existing.level_conservative,
    level_final: level,
    evidence:
      `${existing.evidence}\n\nRecalculated from ${cause} ` +
      `(points by band: ${breakdown}) -> level ${level}.`,
  });
  return true;
}
