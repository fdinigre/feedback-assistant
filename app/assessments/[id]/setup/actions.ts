"use server";

import { revalidatePath } from "next/cache";
import {
  findOrCreateLearningTarget,
  getAssessment,
  getDpResult,
  listAssessments,
  listQuestions,
  listSubmissions,
  updateDpAssessment,
  updateQuestion,
  upsertDpResult,
} from "@/lib/db/queries";
import type { DpQuestionScheme, GradeBoundary } from "@/lib/types";
import { computeDpGrade } from "@/lib/pipeline/grade-dp-core";
import { parseMarkscheme } from "@/lib/pipeline/ms-parse";
import { extractCoverTargets, matchTargetsToQuestions } from "@/lib/assessment/cover-targets";
import { validateBoundaries } from "@/lib/assessment/dp-boundaries";
import { clearParseApproved, markParseApproved, saveDpFile } from "@/lib/assessment/dp-paths";
import { syncAssessmentStatus } from "@/lib/assessment/completeness";

export type DpFormState = { error: string | null };

/** Normalize a model-returned question label ("Question 1", "Q1", "1.") to the bare number. */
function normalizeQNumber(s: string): string {
  return s.trim().replace(/^(question|q)\s*/i, "").replace(/[.)\s]+$/, "").trim();
}

const ALLOWED_EXTENSIONS = [".pdf", ".docx"];

function refresh(assessmentId: number) {
  revalidatePath(`/assessments/${assessmentId}/setup`);
  revalidatePath(`/assessments/${assessmentId}`);
}

function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx).toLowerCase();
}

// ---------------------------------------------------------------------------
// File uploads (spec P3): paper + markscheme, separate files, PDF or .docx.
// ---------------------------------------------------------------------------

async function uploadDpFile(
  assessmentId: number,
  kind: "paper" | "markscheme",
  formData: FormData
): Promise<DpFormState> {
  const assessment = getAssessment(assessmentId);
  if (!assessment || assessment.programme !== "DP") {
    return { error: "DP assessment not found." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }
  const ext = extensionOf(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { error: "Only PDF or .docx files are accepted." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const savedPath = saveDpFile(assessmentId, kind, file.name, bytes);

  if (kind === "paper") {
    updateDpAssessment(assessmentId, { paper_file: savedPath });
  } else {
    updateDpAssessment(assessmentId, { markscheme_file: savedPath });
  }

  // A new markscheme upload invalidates any previous parse approval.
  if (kind === "markscheme") clearParseApproved(assessmentId);

  syncAssessmentStatus(assessmentId);
  refresh(assessmentId);
  return { error: null };
}

export async function uploadDpPaper(
  assessmentId: number,
  _prev: DpFormState,
  formData: FormData
): Promise<DpFormState> {
  return uploadDpFile(assessmentId, "paper", formData);
}

export async function uploadDpMarkscheme(
  assessmentId: number,
  _prev: DpFormState,
  formData: FormData
): Promise<DpFormState> {
  return uploadDpFile(assessmentId, "markscheme", formData);
}

// ---------------------------------------------------------------------------
// Markscheme parse (spec P4/P4b)
// ---------------------------------------------------------------------------

export async function runMsParseAction(
  assessmentId: number,
  _prev: DpFormState
): Promise<DpFormState> {
  try {
    await parseMarkscheme(assessmentId);
  } catch (err) {
    return { error: (err as Error).message };
  }
  syncAssessmentStatus(assessmentId);
  refresh(assessmentId);
  return { error: null };
}

/** Saves a manually-edited DpQuestionScheme for one question (the parse editor). */
export async function saveDpQuestionScheme(
  assessmentId: number,
  questionId: number,
  formData: FormData
): Promise<void> {
  const raw = String(formData.get("scheme_json") ?? "");
  let scheme: DpQuestionScheme;
  try {
    scheme = JSON.parse(raw) as DpQuestionScheme;
  } catch {
    return;
  }
  const totalMarks = Number.isFinite(scheme.totalMarks) ? scheme.totalMarks : 0;
  updateQuestion(questionId, { dp_scheme: scheme, max_points: totalMarks });
  // Editing the parse manually invalidates any previous approval.
  clearParseApproved(assessmentId);
  syncAssessmentStatus(assessmentId);
  refresh(assessmentId);
}

export async function approveParseAction(assessmentId: number, _formData: FormData): Promise<void> {
  const questions = listQuestions(assessmentId);
  if (questions.length === 0) return;
  markParseApproved(assessmentId);
  syncAssessmentStatus(assessmentId);
  refresh(assessmentId);
}

// ---------------------------------------------------------------------------
// Cover learning targets (spec P5)
// ---------------------------------------------------------------------------

export async function extractCoverTargetsAction(
  assessmentId: number,
  _prev: DpFormState
): Promise<DpFormState> {
  const assessment = getAssessment(assessmentId);
  if (!assessment) return { error: "Assessment not found." };

  let result;
  try {
    result = await extractCoverTargets(assessmentId);
  } catch (err) {
    return { error: (err as Error).message };
  }

  updateDpAssessment(assessmentId, { cover_targets: result.targets });

  if (result.targets.length > 0 && result.mapping.length > 0) {
    const questions = listQuestions(assessmentId);
    const byNumber = new Map(questions.map((q) => [normalizeQNumber(q.number), q]));
    for (const entry of result.mapping) {
      const question = byNumber.get(normalizeQNumber(entry.questionNumber));
      if (!question) continue;
      const target = findOrCreateLearningTarget({ grade: assessment.grade, name: entry.target });
      updateQuestion(question.id, { learning_target_id: target.id });
    }
  }

  refresh(assessmentId);
  return { error: null };
}

/**
 * Auto-matches the assessment's saved learning targets (typed or extracted) to its questions,
 * by reading the paper's question text. Applies the proposed mapping; the teacher confirms/adjusts.
 */
export async function matchTargetsAction(
  assessmentId: number,
  _prev: DpFormState
): Promise<DpFormState> {
  const assessment = getAssessment(assessmentId);
  if (!assessment) return { error: "Assessment not found." };
  const targets = assessment.cover_targets ?? [];
  if (targets.length === 0) {
    return { error: "Type or extract the learning targets first, then match them." };
  }
  let mapping;
  try {
    mapping = await matchTargetsToQuestions(assessmentId, targets);
  } catch (err) {
    return { error: (err as Error).message };
  }
  if (mapping.length === 0) {
    return { error: "Couldn't confidently match any question — set them by hand below." };
  }
  const byNumber = new Map(listQuestions(assessmentId).map((q) => [normalizeQNumber(q.number), q]));
  for (const entry of mapping) {
    const question = byNumber.get(normalizeQNumber(entry.questionNumber));
    if (!question) continue;
    const target = findOrCreateLearningTarget({ grade: assessment.grade, name: entry.target });
    updateQuestion(question.id, { learning_target_id: target.id });
  }
  refresh(assessmentId);
  return { error: null };
}

/** Manual fallback when the cover has no readable learning targets (spec edge case). */
export async function saveCoverTargetsManual(assessmentId: number, formData: FormData): Promise<void> {
  const raw = String(formData.get("targets") ?? "");
  const targets = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  updateDpAssessment(assessmentId, { cover_targets: targets.length > 0 ? targets : null });
  refresh(assessmentId);
}

/** Confirms/adjusts the proposed target for one question (reuses the LearningTargetCombobox pattern). */
export async function setQuestionLearningTarget(
  assessmentId: number,
  questionId: number,
  formData: FormData
): Promise<void> {
  const assessment = getAssessment(assessmentId);
  if (!assessment) return;
  const targetName = String(formData.get("learning_target_name") ?? "").trim();
  const learningTargetId = targetName
    ? findOrCreateLearningTarget({ grade: assessment.grade, name: targetName }).id
    : null;
  updateQuestion(questionId, { learning_target_id: learningTargetId });
  refresh(assessmentId);
}

// ---------------------------------------------------------------------------
// Grade boundaries (spec P6)
// ---------------------------------------------------------------------------

export async function saveDpBoundaries(
  assessmentId: number,
  _prev: DpFormState,
  formData: FormData
): Promise<DpFormState> {
  const boundaries: GradeBoundary[] = [];
  for (let grade = 1; grade <= 7; grade++) {
    const raw = String(formData.get(`grade_${grade}`) ?? "").trim();
    const minPct = raw === "" ? NaN : Number(raw);
    boundaries.push({ grade, minPct });
  }

  const error = validateBoundaries(boundaries);
  if (error) return { error };

  updateDpAssessment(assessmentId, { boundaries });

  // Re-apply the new boundaries to every already-graded submission: the marks (and so
  // the percentage) don't change, only which grade band the percentage falls into.
  // This is a pure recompute — no AI re-grading — so it's instant.
  for (const sub of listSubmissions(assessmentId)) {
    const r = getDpResult(sub.id);
    if (!r) continue;
    upsertDpResult({
      submission_id: sub.id,
      total_marks: r.total_marks,
      max_marks: r.max_marks,
      pct: r.pct,
      grade: computeDpGrade(r.pct, boundaries),
      grade_final: r.grade_final == null ? null : computeDpGrade(r.pct, boundaries),
    });
  }

  syncAssessmentStatus(assessmentId);
  refresh(assessmentId);
  return { error: null };
}
