import "server-only";

import {
  getAssessment,
  listLevelThresholds,
  listQuestions,
  listRubricDescriptors,
  listRubrics,
  listWorkedSolutions,
  updateAssessment,
} from "@/lib/db/queries";
import { bandLevels, usesLevelThresholds } from "./bands";
import type { AssessmentRow } from "@/lib/types";
import { isParseApproved } from "./dp-paths";
import { validateBoundaries } from "./dp-boundaries";

export type SetupCompleteness = {
  ready: boolean;
  missing: string[];
};

/**
 * DP assessment setup completeness (ibdp-mode spec, edge case "Parse do markscheme falha ou
 * sai errado"): ready when the paper + markscheme are uploaded, the parse has been reviewed
 * and approved, there is >=1 question, boundaries are a valid 7-band table, and the name mask
 * is set. Learning targets are recommended (spec P5/edge case "Capa sem learning targets
 * legíveis") but never block readiness.
 */
function computeDpCompleteness(assessmentId: number): SetupCompleteness {
  const assessment = getAssessment(assessmentId);
  if (!assessment) return { ready: false, missing: ["Assessment not found."] };

  const missing: string[] = [];
  if (!assessment.paper_file) missing.push("Upload the exam paper.");
  if (!assessment.markscheme_file) missing.push("Upload the official markscheme.");

  const questions = listQuestions(assessmentId);
  if (questions.length === 0) {
    missing.push("At least one question (run the markscheme parse).");
  }

  if (assessment.paper_file && assessment.markscheme_file && questions.length > 0) {
    if (!isParseApproved(assessmentId)) {
      missing.push("Approve the markscheme parse.");
    }
  }

  if (!assessment.boundaries || validateBoundaries(assessment.boundaries) !== null) {
    missing.push("A valid grade boundary table (7 bands, grade 1 at 0%).");
  }

  if (!assessment.name_mask) {
    missing.push("The name mask (page 1 handwritten-name region).");
  }

  return { ready: missing.length === 0, missing };
}

/**
 * Assessment setup completeness (spec F3–F6 item 7):
 * ready when it has >=1 question, thresholds for every level implied by its
 * question bands, a whole-assessment worked solution, and (if B/D) a rubric
 * for each of those criteria.
 */
export function computeCompleteness(assessmentId: number): SetupCompleteness {
  const assessment = getAssessment(assessmentId);
  if (!assessment) {
    return { ready: false, missing: ["Assessment not found."] };
  }
  if (assessment.programme === "DP") {
    return computeDpCompleteness(assessmentId);
  }

  const missing: string[] = [];
  const questions = listQuestions(assessmentId);

  if (questions.length === 0) {
    missing.push("At least one question.");
  }

  // Thresholds belong to Criterion A alone — B/C/D are marked against the rubric,
  // and a Financial Math test is scored as points out of a total. Neither has a
  // level to compute from band points, so neither waits on thresholds here.
  const requiredLevels = new Set<number>();
  for (const q of questions) {
    if (!usesLevelThresholds(assessment)) break;
    if (!q.level_band) continue; // DP questions have no MYP level band
    const [low, high] = bandLevels(q.level_band);
    requiredLevels.add(low);
    requiredLevels.add(high);
  }
  const setLevels = new Set(listLevelThresholds(assessmentId).map((t) => t.level));
  const missingLevels = [...requiredLevels]
    .filter((level) => !setLevels.has(level))
    .sort((a, b) => a - b);
  if (missingLevels.length > 0) {
    missing.push(`Point thresholds for level(s) ${missingLevels.join(", ")}.`);
  }

  const hasWholeAssessmentSolution = listWorkedSolutions(assessmentId).some(
    (ws) => ws.question_id === null && ws.content.trim().length > 0
  );
  if (!hasWholeAssessmentSolution) {
    missing.push("A whole-assessment worked solution.");
  }

  // What the grader marks B and D against: the band descriptors read from the task,
  // or — for a task that prints no rubric table — the free-text rubric written by hand.
  // Either one satisfies this; asking for both would hold up an assessment whose
  // descriptors are already on file over a box that only restates them.
  const rubrics = listRubrics(assessmentId);
  for (const criterion of assessment.criteria) {
    if (criterion !== "B" && criterion !== "D") continue;
    if (listRubricDescriptors(assessmentId, criterion).length > 0) continue;
    const rubric = rubrics.find((r) => r.criterion === criterion && r.content.trim().length > 0);
    if (!rubric) {
      missing.push(`Band descriptors or a task-specific rubric for Criterion ${criterion}.`);
    }
  }

  // The name mask gates the privacy guarantee for scanned work — require it for MYP
  // too (DP already does), so a paper can't be graded with the page-1 name unmasked.
  if (!assessment.name_mask) {
    missing.push("The name mask (page 1 handwritten-name region).");
  }

  return { ready: missing.length === 0, missing };
}

/**
 * Flips assessment.status between 'setup' and 'ready' based on completeness.
 * Only touches the status when it is currently one of those two values, so
 * it never clobbers later-pipeline statuses (intake/grading/etc.) owned by
 * other features.
 */
export function syncAssessmentStatus(assessmentId: number): SetupCompleteness {
  const completeness = computeCompleteness(assessmentId);
  const assessment = getAssessment(assessmentId);
  if (assessment && (assessment.status === "setup" || assessment.status === "ready")) {
    const nextStatus = completeness.ready ? "ready" : "setup";
    if (assessment.status !== nextStatus) {
      updateAssessment(assessmentId, { status: nextStatus });
    }
  }
  return completeness;
}

/**
 * The status to show for an assessment, as the badge on the list and detail pages.
 *
 * The stored status only moves when a setup action runs, so it lags behind any
 * change to what setup requires — a Criterion B task that no longer waits on
 * point thresholds reads "setup" until the teacher saves something. Deriving the
 * badge keeps it from contradicting the completeness list right beside it.
 * Later-pipeline statuses (intake/grading/...) are shown as they stand.
 */
export function displayStatus(assessment: AssessmentRow): string {
  if (assessment.status !== "setup" && assessment.status !== "ready") return assessment.status;
  return computeCompleteness(assessment.id).ready ? "ready" : "setup";
}
