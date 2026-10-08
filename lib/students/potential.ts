import "server-only";

import { getExternalDataBySource, listCriterionLevels, listGradings, listQuestions } from "@/lib/db/queries";
import { listGradedSubmissions } from "@/lib/students/shared";
import { sumQuestionMarks, pickFinal } from "@/lib/submissions/dp-calc";
import type { DpGradingQuestion } from "@/lib/types";

export type PotentialVsAttainment = {
  map: Record<string, string> | null;
  cat4: Record<string, string> | null;
  /** % of total points earned across ALL graded assessments, or null if none graded yet. */
  currentAveragePct: number | null;
  /** Computed rule (no AI): CAT4 Quantitative/Spatial SAS >= 112 while latest Criterion A level <= 4. */
  underperformanceNote: boolean;
};

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Compares potential (MAP/CAT4, when on file) against attainment (this
 * student's actual average % across all graded assessments). The
 * "possible underperformance vs potential" note is a fixed, explainable
 * rule — never an AI judgment — per spec.
 */
export function computePotentialVsAttainment(studentId: number): PotentialVsAttainment {
  const mapRow = getExternalDataBySource(studentId, "MAP");
  const cat4Row = getExternalDataBySource(studentId, "CAT4");

  const graded = listGradedSubmissions(studentId);
  let earnedTotal = 0;
  let maxTotal = 0;
  for (const { assessment, submission } of graded) {
    const questionById = new Map(listQuestions(assessment.id).map((q) => [q.id, q]));
    for (const grading of listGradings(submission.id)) {
      const question = questionById.get(grading.question_id);
      if (!question) continue;
      // DP gradings hold sub-part awards (capped final total); MYP gradings default to
      // the conservative pass. Fall back to 0 so a missing field never yields NaN.
      const content = grading.content as Record<string, unknown>;
      earnedTotal += Array.isArray(content.subparts)
        ? sumQuestionMarks(grading.content as unknown as DpGradingQuestion, question.dp_scheme, pickFinal)
        : ((content.finalPoints as number | null) ??
          (content.conservativePoints as number | undefined) ??
          (content.proposedPoints as number | undefined) ??
          0);
      maxTotal += question.max_points;
    }
  }
  const currentAveragePct = maxTotal > 0 ? (earnedTotal / maxTotal) * 100 : null;

  let underperformanceNote = false;
  if (cat4Row) {
    const data = cat4Row.data as Record<string, unknown>;
    const quant = toNum(data["Quantitative SAS"]);
    const spatial = toNum(data["Spatial SAS"]);
    const highPotential = (quant != null && quant >= 112) || (spatial != null && spatial >= 112);

    if (highPotential && graded.length > 0) {
      const latest = graded[graded.length - 1];
      const levels = listCriterionLevels(latest.submission.id);
      const criterionA = levels.find((l) => l.criterion === "A");
      if (criterionA) {
        const level = criterionA.level_final ?? criterionA.level_conservative;
        if (level <= 4) underperformanceNote = true;
      }
    }
  }

  return {
    map: mapRow ? (mapRow.data as Record<string, string>) : null,
    cat4: cat4Row ? (cat4Row.data as Record<string, string>) : null,
    currentAveragePct,
    underperformanceNote,
  };
}
