"use server";

import { isFmTest } from "./course";
import { proposeAnswerKey, type ProposeKeyResult } from "./propose-key";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createDpAssessment,
  deleteLevelThreshold,
  deleteQuestionCascade,
  findOrCreateLearningTarget,
  getAssessment,
  getClass,
  getLevelThreshold,
  getRubric,
  insertAssessment,
  insertQuestion,
  insertRubric,
  listRubricDescriptors,
  listTaskDocuments,
  getTaskDocument,
  insertTaskDocument,
  updateTaskDocument,
  deleteTaskDocument,
  saveRubricDescriptors,
  type RubricDescriptorInput,
  insertWorkedSolution,
  listQuestions,
  listSubmissions,
  deleteAssessmentCascade,
  listWorkedSolutions,
  updateAssessment,
  updateQuestion,
  updateRubric,
  updateWorkedSolution,
  upsertLevelThreshold,
} from "@/lib/db/queries";
import type {
  AssessmentRow,
  Criterion,
  DpAssessmentType,
  LevelBand,
  NameMask,
  QuestionVariant,
  TaskDocumentKind,
} from "@/lib/types";
import { ALL_CRITERIA, validateCriteria } from "./criteria";
import { LEVEL_BANDS, usesLevelThresholds } from "./bands";
import { syncAssessmentStatus } from "./completeness";
import fs from "node:fs";
import path from "node:path";
import { applyNameMask } from "@/lib/pdf";
import { pagesDir } from "@/lib/intake/paths";
import { clearMissingNameMaskWarnings } from "@/lib/intake/batch";
import { resolveStoredPath } from "./file-paths";
import {
  extractMypPaper,
  extractMypPaperFromText,
  type PaperExtractResult,
  type ProposedRubric,
  extractWorkedSolutionsVision,
  extractWorkedSolutionText,
  saveMypPaper,
  saveWorkedSolutionFile,
} from "./paper-extract";
import {
  extractRubricsFromDocuments,
  readTaskDocument,
  removeRosterNames,
  saveTaskDocumentFile,
} from "./task-documents";
import {
  guessTaskDocumentKind,
  RUBRIC_SOURCE_KINDS,
  TASK_DOCUMENT_KINDS,
} from "./task-document-kinds";

export type FormState = { error: string | null };

export type PaperExtractState = {
  error: string | null;
  /** Number of questions proposed and added for review on success. */
  added?: number;
  /** Proposed questions skipped because that number was already in the list. */
  skipped?: number;
  coverTargets?: string[];
  /** The criterion whose band descriptors the paper's rubric table filled in, if any. */
  descriptorCriterion?: string;
  descriptorsAdded?: number;
};

export type ProposeDescriptorsState = {
  error: string | null;
  /** One entry per criterion the read filled in. */
  results?: { criterion: string; added: number }[];
  /** What the read could not place, or left alone — said rather than dropped. */
  notes?: string[];
};

/**
 * Writes a rubric table read off the task paper, deciding which criterion it belongs to:
 * the letter the table names when the assessment assesses it, else the only criterion
 * marked on descriptors when there is just one — or, on a C/D task, the one that is
 * not C, since C is the companion criterion and its table is the one that gets labelled.
 *
 * It never overwrites: a criterion that already has descriptors is left alone and said
 * so, the way proposeAnswerKey refuses to write over the teacher's own key. Clearing
 * them in the editor is the deliberate way to ask for a fresh read.
 */
function persistProposedRubric(
  assessment: AssessmentRow,
  rubric: ProposedRubric | null
): { criterion: string | null; added: number; error: string | null } {
  if (!rubric) {
    return { criterion: null, added: 0, error: "No achievement-level table could be read from the paper." };
  }
  const rubricCriteria = assessment.criteria.filter((c) => c === "B" || c === "C" || c === "D");
  const named =
    rubric.criterion && (rubricCriteria as string[]).includes(rubric.criterion)
      ? rubric.criterion
      : null;
  const mainCriteria = rubricCriteria.filter((c) => c !== "C");
  const criterion =
    named ??
    (rubricCriteria.length === 1 ? rubricCriteria[0] : null) ??
    (!rubric.criterion && mainCriteria.length === 1 ? mainCriteria[0] : null);
  if (!criterion && rubric.criterion) {
    return {
      criterion: null,
      added: 0,
      error: `A Criterion ${rubric.criterion} table was found, but this assessment doesn't assess Criterion ${rubric.criterion}.`,
    };
  }
  if (!criterion) {
    return {
      criterion: null,
      added: 0,
      error:
        "The paper's rubric table doesn't say which criterion it is for, and this assessment has more than one — add the rows by hand.",
    };
  }
  if (listRubricDescriptors(assessment.id, criterion).length > 0) {
    return {
      criterion,
      added: 0,
      error: `Criterion ${criterion} already has band descriptors — edit them below, or clear them first to read the paper again.`,
    };
  }

  const byBand = new Map<string, number>();
  const rows: RubricDescriptorInput[] = rubric.descriptors.map((d) => {
    const position = byBand.get(d.band) ?? 0;
    byBand.set(d.band, position + 1);
    return {
      id: null,
      band: d.band,
      strand: d.strand,
      position,
      text: d.text,
      student_text: d.studentText,
    };
  });
  saveRubricDescriptors(assessment.id, criterion, rows);
  return { criterion, added: rows.length, error: null };
}

/**
 * Reads the band descriptors off what is already on file: the task documents when
 * there are any (every table across them, one per criterion — a C/D task can print
 * both), else the task paper, for an assessment set up before task documents existed.
 */
export async function proposeRubricDescriptorsAction(
  assessmentId: number,
  _prev: ProposeDescriptorsState
): Promise<ProposeDescriptorsState> {
  const assessment = getAssessment(assessmentId);
  if (!assessment) return { error: "Assessment not found." };
  const sources = listTaskDocuments(assessmentId).filter(
    (d) => RUBRIC_SOURCE_KINDS.includes(d.kind) && d.text.trim() !== ""
  );
  if (sources.length === 0 && !assessment.paper_file) {
    return { error: "Upload the task documents first (above) — the descriptors are read from them." };
  }
  // Refuse before spending a minute reading the documents, not after.
  const openCriteria = assessment.criteria.filter(
    (c) => (c === "B" || c === "C" || c === "D") && listRubricDescriptors(assessmentId, c).length === 0
  );
  if (openCriteria.length === 0) {
    return {
      error:
        "Every criterion already has band descriptors — edit them below, or clear a criterion's rows first to read the documents again.",
    };
  }
  try {
    let rubrics: ProposedRubric[];
    if (sources.length > 0) {
      rubrics = await extractRubricsFromDocuments(sources);
    } else {
      const paperPath = resolveStoredPath(assessment.paper_file);
      if (!paperPath) return { error: "The task paper is on file but its file is missing — upload it again." };
      const rubric = (await extractMypPaper(paperPath)).rubric;
      rubrics = rubric ? [rubric] : [];
    }
    if (rubrics.length === 0) {
      return { error: "No achievement-level table could be read from the documents — add the rows by hand." };
    }

    const results: { criterion: string; added: number }[] = [];
    const notes: string[] = [];
    for (const rubric of rubrics) {
      const written = persistProposedRubric(assessment, rubric);
      if (written.error) notes.push(written.error);
      else results.push({ criterion: written.criterion!, added: written.added });
    }
    if (results.length === 0) return { error: notes.join(" ") };
    for (const c of openCriteria) {
      if (listRubricDescriptors(assessmentId, c).length > 0) continue;
      notes.push(
        c === "C"
          ? "There's no Criterion C table in the documents. Add its descriptors below, or leave them empty and C is judged on how clearly the work communicates, in general terms."
          : `There's no Criterion ${c} table in the documents — add its descriptors below.`
      );
    }

    syncAssessmentStatus(assessmentId);
    revalidatePath(`/assessments/${assessmentId}/setup`);
    revalidatePath(`/assessments/${assessmentId}`);
    return { error: null, results, notes };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/**
 * MYP setup helper: upload a blank test paper (PDF/.docx), have the AI propose a question list
 * + learning targets, and create those as draft questions for the teacher to review and edit
 * in the Questions section — before any markscheme/worked solutions or student work. Proposed
 * questions are APPENDED (never overwrite existing ones); the teacher deletes any she doesn't want.
 */
export async function uploadMypPaperAndExtract(
  _prev: PaperExtractState,
  formData: FormData
): Promise<PaperExtractState> {
  const assessmentId = Number(formData.get("assessmentId"));
  const assessment = getAssessment(assessmentId);
  if (!assessment) return { error: "Assessment not found." };
  if (assessment.programme === "DP") {
    return { error: "This auto-extract is for MYP assessments; DP uses the markscheme parser." };
  }

  const file = formData.get("paper");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PDF or Word file of the test paper first." };
  }
  const ext = file.name.toLowerCase();
  if (!ext.endsWith(".pdf") && !ext.endsWith(".docx")) {
    return { error: "Only PDF or Word (.docx) files are supported." };
  }

  let result;
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const savedPath = saveMypPaper(assessmentId, file.name, bytes);
    // Record where it went. This was missing: the file landed in data/papers/
    // but nothing pointed at it, so anything downstream that wants the blank
    // paper — the name-mask preview — had no way to find it.
    updateAssessment(assessmentId, { paper_file: savedPath });
    result = await extractMypPaper(savedPath);
  } catch (err) {
    return { error: (err as Error).message };
  }

  return addProposedQuestions(assessment, result);
}

/**
 * Adds the questions read off a paper to the list — appended, never overwriting, and
 * skipping any number already there — and fills in the rubric table it printed.
 */
function addProposedQuestions(assessment: AssessmentRow, result: PaperExtractResult): PaperExtractState {
  const assessmentId = assessment.id;
  if (result.questions.length === 0) {
    return {
      error:
        "No questions could be read from the paper. If it's a scanned image, the text can't be extracted — enter questions manually.",
    };
  }

  // Skip any proposed question whose number is already on the assessment, so
  // re-running the extraction (or running it after some manual entry) never creates
  // duplicate rows — it only fills in the ones that are missing.
  const existingNumbers = new Set(listQuestions(assessmentId).map((q) => q.number.trim()));
  let added = 0;
  let skipped = 0;
  for (const q of result.questions) {
    if (existingNumbers.has(q.number.trim())) {
      skipped++;
      continue;
    }
    const learningTargetId = q.learningTarget
      ? findOrCreateLearningTarget({ grade: assessment.grade, name: q.learningTarget }).id
      : null;
    insertQuestion({
      assessment_id: assessmentId,
      number: q.number,
      max_points: q.maxPoints ?? 1, // teacher confirms; 1 is a safe editable default
      level_band: usesLevelThresholds(assessment) ? q.levelBand : null, // no Criterion A, no bands
      learning_target_id: learningTargetId,
    });
    existingNumbers.add(q.number.trim());
    added++;
  }

  syncAssessmentStatus(assessmentId);
  revalidatePath(`/assessments/${assessmentId}/setup`);
  revalidatePath(`/assessments/${assessmentId}`);
  if (added === 0) {
    return {
      error:
        skipped > 0
          ? `All ${skipped} question(s) read from the paper are already in the list — nothing new to add.`
          : "No questions could be read from the paper.",
    };
  }
  // The same paper usually prints the achievement-level table; fill it in while we have it.
  const written = persistProposedRubric(assessment, result.rubric);

  return {
    error: null,
    added,
    skipped,
    coverTargets: result.coverTargets,
    ...(written.added > 0
      ? { descriptorCriterion: written.criterion!, descriptorsAdded: written.added }
      : {}),
  };
}

export type WorkedUploadState = { error: string | null; chars?: number; usedVision?: boolean };

/**
 * MYP setup: upload a worked-solutions / markscheme file and store it as the whole-assessment
 * worked solution the grader reads.
 *   - PDF  -> read with VISION (rasterize + AI), because these keys are typically HANDWRITTEN
 *            with mark boxes and coordinate diagrams that plain text extraction can't capture.
 *   - .docx -> local text extraction (typed keys), no AI needed.
 * The teacher reviews/edits the result in the worked-solution box.
 */
export async function uploadMypWorkedSolutions(
  _prev: WorkedUploadState,
  formData: FormData
): Promise<WorkedUploadState> {
  const assessmentId = Number(formData.get("assessmentId"));
  const assessment = getAssessment(assessmentId);
  if (!assessment) return { error: "Assessment not found." };

  const file = formData.get("worked");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PDF or Word file first." };
  }
  const ext = file.name.toLowerCase();
  const isPdf = ext.endsWith(".pdf");
  if (!isPdf && !ext.endsWith(".docx")) {
    return { error: "Only PDF or Word (.docx) files are supported." };
  }

  let text: string;
  let usedVision = false;
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const savedPath = saveWorkedSolutionFile(assessmentId, file.name, bytes);
    if (isPdf) {
      usedVision = true;
      const outDir = path.join(path.dirname(savedPath), "worked-pages");
      text = await extractWorkedSolutionsVision(savedPath, outDir);
    } else {
      text = await extractWorkedSolutionText(savedPath);
    }
  } catch (err) {
    return { error: (err as Error).message };
  }
  if (!text) {
    return {
      error:
        "Nothing could be read from that file. Paste the worked solutions into the text box below instead.",
    };
  }

  const existing = listWorkedSolutions(assessmentId).find((ws) => ws.question_id === null);
  if (existing) updateWorkedSolution(existing.id, text);
  else insertWorkedSolution({ assessment_id: assessmentId, question_id: null, content: text });

  syncAssessmentStatus(assessmentId);
  revalidatePath(`/assessments/${assessmentId}/setup`);
  revalidatePath(`/assessments/${assessmentId}`);
  return { error: null, chars: text.length, usedVision };
}

// ---------------------------------------------------------------------------
// task documents (B/C/D: as many as the task has)
// ---------------------------------------------------------------------------

export type TaskDocumentUploadState = {
  error: string | null;
  added?: {
    name: string;
    kind: TaskDocumentKind;
    chars: number;
    usedVision: boolean;
    namesRemoved: number;
  }[];
  failed?: { name: string; message: string }[];
};

/**
 * Takes several files in one go — the task sheet, the template, the checklist, an
 * exemplar — reads each, and files it under a kind guessed from its name, which the
 * teacher corrects in the list if the guess is wrong. A file that cannot be read is
 * reported by name without stopping the others.
 */
export async function uploadTaskDocuments(
  _prev: TaskDocumentUploadState,
  formData: FormData
): Promise<TaskDocumentUploadState> {
  const assessmentId = Number(formData.get("assessmentId"));
  const assessment = getAssessment(assessmentId);
  if (!assessment) return { error: "Assessment not found." };
  if (assessment.programme === "DP") return { error: "Task documents are for MYP tasks." };

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Choose one or more PDF or Word files first." };

  const added: NonNullable<TaskDocumentUploadState["added"]> = [];
  const failed: NonNullable<TaskDocumentUploadState["failed"]> = [];
  let hasTaskSheet = listTaskDocuments(assessmentId).some((d) => d.kind === "task");

  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".pdf") && !lower.endsWith(".docx")) {
      failed.push({ name: file.name, message: "Only PDF or Word (.docx) files can be read." });
      continue;
    }
    let absolute: string | null = null;
    try {
      const kind = guessTaskDocumentKind(file.name, hasTaskSheet);
      const stored = saveTaskDocumentFile(assessmentId, file.name, Buffer.from(await file.arrayBuffer()));
      absolute = resolveStoredPath(stored);
      if (!absolute) throw new Error("The file could not be saved.");
      const read = await readTaskDocument(absolute, kind);
      if (!read.text) {
        removeStoredDocument(absolute);
        failed.push({ name: file.name, message: "Nothing could be read from it." });
        continue;
      }
      const clean = removeRosterNames(read.text);
      insertTaskDocument({
        assessment_id: assessmentId,
        kind,
        original_name: file.name,
        file_path: stored,
        text: clean.text,
        used_vision: read.usedVision,
      });
      if (kind === "task") hasTaskSheet = true;
      added.push({
        name: file.name,
        kind,
        chars: clean.text.length,
        usedVision: read.usedVision,
        namesRemoved: clean.removed.length,
      });
    } catch (err) {
      if (absolute) removeStoredDocument(absolute);
      failed.push({ name: file.name, message: (err as Error).message });
    }
  }

  syncAssessmentStatus(assessmentId);
  revalidatePath(`/assessments/${assessmentId}/setup`);
  revalidatePath(`/assessments/${assessmentId}`);
  return {
    error: added.length === 0 ? "None of the files could be read." : null,
    added,
    failed,
  };
}

/** A document's file, and the page images a scanned one was read from. */
function removeStoredDocument(absolute: string): void {
  fs.rmSync(absolute, { force: true });
  fs.rmSync(`${absolute}-pages`, { recursive: true, force: true });
}

/** Relabels one document, for when the guess from its file name was wrong. */
export async function setTaskDocumentKind(
  assessmentId: number,
  documentId: number,
  formData: FormData
): Promise<void> {
  const kind = String(formData.get("kind") ?? "") as TaskDocumentKind;
  if (!TASK_DOCUMENT_KINDS.includes(kind)) return;
  const doc = getTaskDocument(documentId);
  if (!doc || doc.assessment_id !== assessmentId) return;
  updateTaskDocument(documentId, { kind });
  syncAssessmentStatus(assessmentId);
  revalidatePath(`/assessments/${assessmentId}/setup`);
  revalidatePath(`/assessments/${assessmentId}`);
}

export type TaskDocumentTextState = { error: string | null; saved?: boolean; namesRemoved?: number };

/**
 * Saves the teacher's correction of what was read from a document. Roster names are
 * taken out again on the way in: a name typed here would otherwise stop the grading.
 */
export async function saveTaskDocumentText(
  assessmentId: number,
  documentId: number,
  _prev: TaskDocumentTextState,
  formData: FormData
): Promise<TaskDocumentTextState> {
  const doc = getTaskDocument(documentId);
  if (!doc || doc.assessment_id !== assessmentId) return { error: "That document is no longer here." };
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { error: "The text can't be empty — remove the document instead." };
  const clean = removeRosterNames(text);
  updateTaskDocument(documentId, { text: clean.text });
  syncAssessmentStatus(assessmentId);
  revalidatePath(`/assessments/${assessmentId}/setup`);
  return { error: null, saved: true, namesRemoved: clean.removed.length };
}

/** Removes one document and its file. If its questions were read from it, the paper goes too. */
export async function removeTaskDocument(assessmentId: number, documentId: number): Promise<void> {
  const doc = getTaskDocument(documentId);
  if (!doc || doc.assessment_id !== assessmentId) return;
  deleteTaskDocument(documentId);
  const absolute = resolveStoredPath(doc.file_path);
  if (absolute) removeStoredDocument(absolute);
  const assessment = getAssessment(assessmentId);
  if (assessment && doc.file_path && assessment.paper_file === doc.file_path) {
    updateAssessment(assessmentId, { paper_file: null });
  }
  syncAssessmentStatus(assessmentId);
  revalidatePath(`/assessments/${assessmentId}/setup`);
  revalidatePath(`/assessments/${assessmentId}`);
}

/**
 * For a task the students answer on, part by part: reads the questions off the
 * task sheet already uploaded, the same way a blank test is read. The sheet becomes
 * the assessment's paper, so the name mask can be placed on its pages.
 */
export async function readQuestionsFromTaskSheet(
  assessmentId: number,
  _prev: PaperExtractState
): Promise<PaperExtractState> {
  const assessment = getAssessment(assessmentId);
  if (!assessment) return { error: "Assessment not found." };
  const sheet = listTaskDocuments(assessmentId).find((d) => d.kind === "task");
  if (!sheet) return { error: "Label one of the documents as the task sheet first." };
  let result: PaperExtractResult;
  try {
    result = await extractMypPaperFromText(sheet.text);
  } catch (err) {
    return { error: (err as Error).message };
  }
  if (sheet.file_path) updateAssessment(assessmentId, { paper_file: sheet.file_path });
  return addProposedQuestions(getAssessment(assessmentId) ?? assessment, result);
}

/**
 * For a task handed in as one piece — a report, a GRASP task — with no numbered
 * questions: one item stands for the whole of it, so the work is read and judged as
 * a whole against the descriptors. Only offered while the list is empty, and never
 * for Criterion A, whose level is built from points per question.
 */
export async function addWholeWorkItem(assessmentId: number, formData: FormData): Promise<void> {
  const assessment = getAssessment(assessmentId);
  if (!assessment || usesLevelThresholds(assessment)) return;
  if (listQuestions(assessmentId).length > 0) return;
  const label = String(formData.get("label") ?? "").trim() || "Report";
  insertQuestion({
    assessment_id: assessmentId,
    number: label,
    max_points: 1,
    level_band: null,
    learning_target_id: null,
  });
  syncAssessmentStatus(assessmentId);
  revalidatePath(`/assessments/${assessmentId}/setup`);
  revalidatePath(`/assessments/${assessmentId}`);
}

export type ProposeKeyState = { error: string | null; result?: ProposeKeyResult };

/**
 * Financial Math test setup: propose the answer key from the blank paper (and
 * the teacher's uploaded key, if any) into the per-question solution boxes.
 */
export async function proposeAnswerKeyAction(
  _prev: ProposeKeyState,
  formData: FormData
): Promise<ProposeKeyState> {
  const assessmentId = Number(formData.get("assessmentId"));
  const assessment = getAssessment(assessmentId);
  if (!assessment) return { error: "Assessment not found." };
  if (!isFmTest(assessment)) return { error: "Only points tests get a proposed key." };
  try {
    const result = await proposeAnswerKey(assessmentId);
    syncAssessmentStatus(assessmentId);
    revalidatePath(`/assessments/${assessmentId}/setup`);
    revalidatePath(`/assessments/${assessmentId}`);
    return { error: null, result };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

function parseCriteria(formData: FormData): Criterion[] {
  return ALL_CRITERIA.filter((c) => formData.get(`criterion_${c}`) === "on");
}

// ---------------------------------------------------------------------------
// assessments
// ---------------------------------------------------------------------------

/**
 * Creates an assessment for ONE class. The class is the source of truth for both
 * grade and programme — an assessment used to carry only a grade, which silently
 * pulled in every class in that grade (two Grade 9 sets sitting one quiz).
 */
export async function createAssessment(_prev: FormState, formData: FormData): Promise<FormState> {
  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const classId = Number(formData.get("class_id") ?? 0);

  if (!title) return { error: "Title is required." };
  if (!classId) return { error: "Select the class sitting this assessment." };

  const cls = getClass(classId);
  if (!cls) return { error: "That class no longer exists — pick another." };

  if (cls.programme === "DP") {
    const assessmentType = String(formData.get("assessment_type") ?? "");
    if (assessmentType !== "quiz" && assessmentType !== "unit_test") {
      return { error: "Select an assessment type." };
    }

    const assessment = createDpAssessment({
      title,
      class_id: cls.id,
      grade: cls.grade,
      assessment_type: assessmentType as DpAssessmentType,
      date: date || null,
    });

    revalidatePath("/assessments");
    redirect(`/assessments/${assessment.id}/setup`);
  }

  if (String(formData.get("assessment_type") ?? "") === "fm_test") {
    // A points test: no criteria, no level bands, no thresholds. Any MYP class.
    const assessment = insertAssessment({
      title,
      class_id: cls.id,
      grade: cls.grade,
      criteria: [],
      assessment_type: "fm_test",
      date: date || null,
    });
    revalidatePath("/assessments");
    redirect(`/assessments/${assessment.id}/setup`);
  }

  const criteria = parseCriteria(formData);
  const criteriaError = validateCriteria(criteria);
  if (criteriaError) return { error: criteriaError };

  const assessment = insertAssessment({
    title,
    class_id: cls.id,
    grade: cls.grade,
    criteria,
    date: date || null,
  });

  revalidatePath("/assessments");
  redirect(`/assessments/${assessment.id}`);
}

/**
 * Saves the assessment's name masks: a required page-1 mask plus any optional
 * later-page masks (e.g. a name repeated on page 2). Each mask is applied to its
 * own page image for every already-uploaded scan, so correcting or adding a mask
 * in setup actually re-protects the earlier uploads. Masked-page files for pages
 * that no longer have a mask are deleted, so turning a page-2 mask back off stops
 * sending a masked page 2.
 */
export async function saveNameMasks(
  assessmentId: number,
  masks: NameMask[]
): Promise<{ error: string | null }> {
  const assessment = getAssessment(assessmentId);
  if (!assessment) return { error: "Assessment not found." };

  // Sanitize: clamp to the page, drop empty rectangles, keep one mask per page
  // (last wins) so a page is masked in a single composite pass.
  const byPage = new Map<number, NameMask>();
  for (const m of masks) {
    const page = clampPageNum(m.page);
    const clean: NameMask = {
      page,
      x: clamp01num(m.x),
      y: clamp01num(m.y),
      w: clamp01num(m.w),
      h: clamp01num(m.h),
    };
    if (clean.w <= 0 || clean.h <= 0) continue;
    byPage.set(page, clean);
  }
  const clean = [...byPage.values()].sort((a, b) => a.page - b.page);

  if (!clean.some((m) => m.page === 1)) {
    return { error: "A page 1 name mask is required." };
  }

  updateAssessment(assessmentId, { name_masks: clean });

  const wantedPages = new Set(clean.map((m) => m.page));
  for (const sub of listSubmissions(assessmentId)) {
    const dir = pagesDir(sub.id);
    for (const m of clean) {
      try {
        const src = path.join(dir, `page-${m.page}.png`);
        if (!fs.existsSync(src)) continue;
        await applyNameMask(src, m, path.join(dir, `page-${m.page}-masked.png`));
      } catch {
        // A single unreadable image shouldn't block saving; it's re-tried next save.
      }
    }
    // Remove masked-page files for pages that are no longer masked.
    try {
      for (const file of fs.readdirSync(dir)) {
        const mm = file.match(/^page-(\d+)-masked\.png$/);
        if (mm && !wantedPages.has(Number(mm[1]))) {
          fs.rmSync(path.join(dir, file), { force: true });
        }
      }
    } catch {
      // best-effort
    }
  }

  // Every uploaded scan has now been masked, so the upload-time
  // "no name mask configured" warning no longer describes reality.
  clearMissingNameMaskWarnings(assessmentId);

  syncAssessmentStatus(assessmentId);
  revalidatePath(`/assessments/${assessmentId}/setup`);
  revalidatePath(`/assessments/${assessmentId}`);
  revalidatePath(`/assessments/${assessmentId}/submissions`);
  return { error: null };
}

/**
 * The teacher's word that this task's papers carry no student names — a typed report
 * handed in as a file, say — so no mask is required and pages go to the AI as they
 * are. Masks already drawn are kept and still applied; turning this off asks for the
 * page-1 mask again. A typed PDF is still checked for class-list names before it is
 * sent (see transcribe.ts).
 */
export async function setNoNameMask(assessmentId: number, formData: FormData): Promise<void> {
  if (!getAssessment(assessmentId)) return;
  const on = formData.get("no_name_mask") === "on";
  updateAssessment(assessmentId, { no_name_mask: on });
  // The upload-time "page 1 not masked" warning no longer describes a problem.
  if (on) clearMissingNameMaskWarnings(assessmentId);
  syncAssessmentStatus(assessmentId);
  revalidatePath(`/assessments/${assessmentId}/setup`);
  revalidatePath(`/assessments/${assessmentId}`);
  revalidatePath(`/assessments/${assessmentId}/submissions`);
}

function clampPageNum(value: number): number {
  const n = Math.round(Number(value ?? 1));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function clamp01num(value: number): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

// ---------------------------------------------------------------------------
// questions
// ---------------------------------------------------------------------------

/**
 * The level band only sorts points into Criterion A's threshold bands. An
 * assessment without Criterion A — a Criterion B task marked on the rubric, or a
 * Financial Math test scored out of a total — has no bands, and its form sends none.
 */
function parseBand(assessment: AssessmentRow, formData: FormData): LevelBand | null {
  if (!usesLevelThresholds(assessment)) return null;
  return String(formData.get("level_band") ?? "") as LevelBand;
}

function parseVariant(formData: FormData): QuestionVariant | null {
  const v = String(formData.get("variant") ?? "");
  return v === "standard" || v === "modified" ? v : null;
}

export async function addQuestion(assessmentId: number, formData: FormData): Promise<void> {
  const assessment = getAssessment(assessmentId);
  if (!assessment) return;

  const number = String(formData.get("number") ?? "").trim();
  const maxPoints = Number(formData.get("max_points"));
  const levelBand = parseBand(assessment, formData);
  const targetName = String(formData.get("learning_target_name") ?? "").trim();

  if (!number || !Number.isFinite(maxPoints) || maxPoints <= 0) return;

  const learningTargetId = targetName
    ? findOrCreateLearningTarget({ grade: assessment.grade, name: targetName }).id
    : null;

  insertQuestion({
    assessment_id: assessmentId,
    number,
    max_points: maxPoints,
    level_band: levelBand,
    learning_target_id: learningTargetId,
    variant: parseVariant(formData),
  });

  syncAssessmentStatus(assessmentId);
  revalidatePath(`/assessments/${assessmentId}/setup`);
  revalidatePath(`/assessments/${assessmentId}`);
}

export async function updateQuestionAction(
  assessmentId: number,
  questionId: number,
  formData: FormData
): Promise<void> {
  const assessment = getAssessment(assessmentId);
  if (!assessment) return;

  const number = String(formData.get("number") ?? "").trim();
  const maxPoints = Number(formData.get("max_points"));
  const levelBand = parseBand(assessment, formData);
  const targetName = String(formData.get("learning_target_name") ?? "").trim();

  if (!number || !Number.isFinite(maxPoints) || maxPoints <= 0) return;

  const learningTargetId = targetName
    ? findOrCreateLearningTarget({ grade: assessment.grade, name: targetName }).id
    : null;

  updateQuestion(questionId, {
    number,
    max_points: maxPoints,
    level_band: levelBand,
    learning_target_id: learningTargetId,
    variant: parseVariant(formData),
  });

  syncAssessmentStatus(assessmentId);
  revalidatePath(`/assessments/${assessmentId}/setup`);
  revalidatePath(`/assessments/${assessmentId}`);
}

/**
 * Removes a question from an assessment, together with every student's
 * transcript and marks for it.
 *
 * This used to delete only the question and its worked solution, which worked
 * until a single paper had been transcribed — after that, transcripts and
 * gradings still referenced the question, the database refused the delete, and
 * the resulting exception surfaced as a blank "server error" page.
 */
export async function deleteQuestionAction(assessmentId: number, questionId: number): Promise<void> {
  try {
    deleteQuestionCascade(questionId);
  } catch (err) {
    // Never let this reach the user as a 500. The setup page reads the flash
    // message below and shows it in place.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`deleteQuestionAction(${questionId}) failed: ${message}`);
    redirect(`/assessments/${assessmentId}/setup?error=${encodeURIComponent(
      "That question could not be removed. Nothing was changed."
    )}`);
  }

  syncAssessmentStatus(assessmentId);
  revalidatePath(`/assessments/${assessmentId}/setup`);
  revalidatePath(`/assessments/${assessmentId}`);
}

/**
 * Reorders questions by swapping their content (number/points/band/target)
 * with the adjacent row rather than reassigning ids — there is no explicit
 * position column in the schema. Safe at setup time, before any submission
 * data references a question_id.
 */
export async function moveQuestion(
  assessmentId: number,
  questionId: number,
  direction: "up" | "down"
): Promise<void> {
  const questions = listQuestions(assessmentId);
  const idx = questions.findIndex((q) => q.id === questionId);
  if (idx === -1) return;

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= questions.length) return;

  const a = questions[idx];
  const b = questions[swapIdx];

  updateQuestion(a.id, {
    number: b.number,
    max_points: b.max_points,
    level_band: b.level_band,
    learning_target_id: b.learning_target_id,
  });
  updateQuestion(b.id, {
    number: a.number,
    max_points: a.max_points,
    level_band: a.level_band,
    learning_target_id: a.learning_target_id,
  });

  revalidatePath(`/assessments/${assessmentId}/setup`);
}

// ---------------------------------------------------------------------------
// level thresholds
// ---------------------------------------------------------------------------

export async function saveThresholds(
  assessmentId: number,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const entries: { level: number; points: number | null }[] = [];
  for (let level = 1; level <= 8; level++) {
    const raw = String(formData.get(`level_${level}`) ?? "").trim();
    entries.push({ level, points: raw === "" ? null : Number(raw) });
  }

  if (entries.some((e) => e.points !== null && (!Number.isFinite(e.points) || e.points < 0))) {
    return { error: "Thresholds must be non-negative numbers." };
  }

  // Thresholds are PER BAND, not cumulative across the whole assessment: each band
  // pair (1-2, 3-4, 5-6, 7-8) is scored from its own questions, so marks reset between
  // bands. We therefore only require the upper level of a pair to need at least as many
  // marks as its lower level — a later band may legitimately need fewer (e.g. level 5 at
  // 4 pts after level 4 at 6 pts). No constraint is enforced across band pairs.
  const pointsAt = new Map<number, number>();
  for (const e of entries) if (e.points !== null) pointsAt.set(e.level, e.points);
  const bandPairs: [number, number][] = [
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
  ];
  for (const [lower, upper] of bandPairs) {
    const lo = pointsAt.get(lower);
    const hi = pointsAt.get(upper);
    if (lo !== undefined && hi !== undefined && hi < lo) {
      return {
        error: `Within the ${lower}-${upper} band, level ${upper} (${hi} pts) can't need fewer marks than level ${lower} (${lo} pts).`,
      };
    }
  }

  for (const e of entries) {
    if (e.points === null) {
      const existing = getLevelThreshold(assessmentId, e.level);
      if (existing) deleteLevelThreshold(existing.id);
    } else {
      upsertLevelThreshold({ assessment_id: assessmentId, level: e.level, min_points: e.points });
    }
  }

  syncAssessmentStatus(assessmentId);
  revalidatePath(`/assessments/${assessmentId}/setup`);
  revalidatePath(`/assessments/${assessmentId}`);
  return { error: null };
}

// ---------------------------------------------------------------------------
// worked solutions
// ---------------------------------------------------------------------------

export async function saveWholeWorkedSolution(assessmentId: number, formData: FormData): Promise<void> {
  const content = String(formData.get("content") ?? "");
  const existing = listWorkedSolutions(assessmentId).find((ws) => ws.question_id === null);
  if (existing) {
    updateWorkedSolution(existing.id, content);
  } else {
    insertWorkedSolution({ assessment_id: assessmentId, question_id: null, content });
  }

  syncAssessmentStatus(assessmentId);
  revalidatePath(`/assessments/${assessmentId}/setup`);
  revalidatePath(`/assessments/${assessmentId}`);
}

export async function saveQuestionWorkedSolution(
  assessmentId: number,
  questionId: number,
  formData: FormData
): Promise<void> {
  const content = String(formData.get("content") ?? "");
  const existing = listWorkedSolutions(assessmentId).find((ws) => ws.question_id === questionId);
  if (existing) {
    updateWorkedSolution(existing.id, content);
  } else {
    insertWorkedSolution({ assessment_id: assessmentId, question_id: questionId, content });
  }
  revalidatePath(`/assessments/${assessmentId}/setup`);
}

// ---------------------------------------------------------------------------
// rubrics (criteria B/C/D)
// ---------------------------------------------------------------------------

/**
 * Writes one criterion's band descriptors from the setup editor. The whole set
 * arrives as JSON carrying each row's id, so saveRubricDescriptors can tell an
 * edited statement from a deleted-and-retyped one and keep the students' ticks.
 * Bad JSON is ignored rather than thrown: the form would otherwise blow up the
 * page over a field the teacher never sees.
 */
export async function saveRubricDescriptorsAction(
  assessmentId: number,
  criterion: string,
  formData: FormData
): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(formData.get("descriptors_json") ?? "[]"));
  } catch {
    return;
  }
  if (!Array.isArray(parsed)) return;

  const descriptors: RubricDescriptorInput[] = [];
  for (const raw of parsed as Record<string, unknown>[]) {
    const band = String(raw.band ?? "") as LevelBand;
    if (!LEVEL_BANDS.includes(band)) continue;
    const text = String(raw.text ?? "").trim();
    if (!text) continue;
    const id = Number(raw.id);
    descriptors.push({
      id: Number.isFinite(id) && id > 0 ? id : null,
      band,
      strand: raw.strand ? String(raw.strand).trim() || null : null,
      position: descriptors.filter((d) => d.band === band).length,
      text,
      student_text: raw.student_text ? String(raw.student_text).trim() || null : null,
    });
  }

  saveRubricDescriptors(assessmentId, criterion, descriptors);
  revalidatePath(`/assessments/${assessmentId}/setup`);
}

export async function saveRubric(
  assessmentId: number,
  criterion: string,
  formData: FormData
): Promise<void> {
  const content = String(formData.get("content") ?? "");
  const existing = getRubric(assessmentId, criterion);
  if (existing) {
    updateRubric(existing.id, content);
  } else {
    insertRubric({ assessment_id: assessmentId, criterion, content });
  }

  syncAssessmentStatus(assessmentId);
  revalidatePath(`/assessments/${assessmentId}/setup`);
  revalidatePath(`/assessments/${assessmentId}`);
}


// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

export type DeleteAssessmentState = { error: string | null };

/**
 * Deletes an assessment with everything under it, then its files on disk: the
 * blank paper, the uploaded scans, and each submission's page images. The
 * button spells out the loss and confirms before this runs.
 */
export async function deleteAssessmentAction(
  _prevState: DeleteAssessmentState,
  formData: FormData
): Promise<DeleteAssessmentState> {
  const id = Number(formData.get("id"));
  const assessment = getAssessment(id);
  if (!assessment) return { error: "Assessment not found." };

  const submissionIds = listSubmissions(id).map((s) => s.id);
  deleteAssessmentCascade(id);

  const dataDir = path.join(/* turbopackIgnore: true */ process.cwd(), "data");
  const dirs = [
    path.join(dataDir, "papers", String(id)),
    path.join(dataDir, "uploads", String(id)),
    ...submissionIds.map((sid) => path.join(dataDir, "pages", String(sid))),
  ];
  for (const dir of dirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort — the rows are gone; a stray folder is harmless
    }
  }

  revalidatePath("/assessments");
  revalidatePath("/");
  if (assessment.class_id !== null) revalidatePath(`/classes/${assessment.class_id}`);
  redirect("/assessments");
}
