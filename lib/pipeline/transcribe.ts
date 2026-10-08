import "server-only";

import { questionsForStudent } from "@/lib/assessment/course";

import fs from "node:fs";
import path from "node:path";
import {
  getAssessment,
  getStudent,
  getSubmission,
  listQuestions,
  updateSubmission,
  upsertTranscript,
} from "@/lib/db/queries";
import type { Programme, QuestionRow, SubmissionRow, TranscriptQuestion } from "@/lib/types";
import { getForbiddenNames, scrubOutput } from "@/lib/pipeline/guards";
import { runClaudeJson } from "@/lib/pipeline/run";
import { reconcileSubParts } from "@/lib/pipeline/subparts";

const PAGES_ROOT = path.join(process.cwd(), "data", "pages");

export type TranscribeResult = {
  submissionId: number;
  questionCount: number;
  warnings: string[];
};

/**
 * Resolves the absolute image paths to send for a submission.
 * - Page 1 is ALWAYS the masked variant (page-1-masked.png). If the masked file
 *   is missing we throw rather than fall back to the unmasked page-1.png — the
 *   handwritten name must never reach the cloud (hard privacy rule).
 * - Scratch pages ARE sent and transcribed (spec: viewable, not graded): work found
 *   only on a scratch page is prefixed "[scratch] " so grading can skip it.
 */
function resolvePageImages(submission: SubmissionRow): string[] {
  const dir = path.join(PAGES_ROOT, String(submission.id));
  if (!fs.existsSync(dir)) {
    throw new Error(
      `transcribe: no rasterized pages found at ${dir} for submission ${submission.id}`
    );
  }

  // Pages the teacher marked as scratch are NOT sent to the model: they are rough
  // work that isn't graded, so skipping them cuts transcription time (fewer images
  // to read). The teacher controls this by marking scratch pages on the submissions
  // page. Page 1 (masked name page) is always kept.
  const scratch = new Set(submission.scratch_pages ?? []);

  // Discover page numbers present on disk (page-N.png), ignoring the masked file.
  const present: number[] = [];
  for (const file of fs.readdirSync(dir)) {
    const m = file.match(/^page-(\d+)\.png$/);
    if (m) {
      const n = Number(m[1]);
      if (n === 1 || !scratch.has(n)) present.push(n);
    }
  }
  present.sort((a, b) => a - b);
  if (present.length === 0) {
    throw new Error(`transcribe: no page-N.png files in ${dir} for submission ${submission.id}`);
  }

  return present.map((n) => {
    // Any page with a configured name mask has a page-N-masked.png on disk — send
    // that instead of the raw page so the masked name never reaches the cloud.
    const masked = path.join(dir, `page-${n}-masked.png`);
    if (fs.existsSync(masked)) return masked;
    if (n === 1) {
      // Page 1 must always be masked (its name area is the guaranteed name location).
      throw new Error(
        `transcribe: masked page 1 missing at ${masked}. Refusing to send unmasked page-1.png ` +
          `(the handwritten student name must not reach the cloud).`
      );
    }
    return path.join(dir, `page-${n}.png`);
  });
}

function buildPrompt(
  pseudonym: string,
  questions: QuestionRow[],
  scratchPages: number[],
  programme: Programme
): string {
  if (programme === "DP") return buildDpPrompt(pseudonym, questions, scratchPages);
  const questionList = questions.map((q) => `- Question ${q.number}`).join("\n");
  return `You are transcribing a scanned, handwritten MYP mathematics assessment for student ${pseudonym}.
The pages are provided as images (read them with your Read tool). Page 1's name area has been masked.

Your ONLY job is to faithfully reconstruct what the student actually wrote, question by question.
You are NOT grading and you must NOT solve the problems yourself.

THE ASSESSMENT CONTAINS THESE QUESTIONS:
${questionList}

RULES — read carefully:
1. Transcribe the student's work per question as a list of short steps. Each step is one line of plain
   text or simple LaTeX-ish notation (e.g. "sin(x) = 3/5", "x^2 - 4 = 0", "area = 1/2 * b * h").
2. NEVER GUESS. If a symbol, digit, or exponent is unreadable, DO NOT infer what it "should" be.
   Instead: put a "[?]" placeholder in that step's text where the unreadable part is, AND add an entry
   to that question's "illegible" array: {stepIndex, note}. Example note: "cannot read exponent in step 3".
   stepIndex is the 0-based index of the affected step within that question's steps array.
3. Mark each step confident:true only if you can read every character in it. If a step contains a "[?]"
   placeholder or you are unsure of any character, set confident:false.
4. If a question has no written work at all, set blank:true and use an empty steps array.
5. Only include questions you actually find in the scan. If a listed question does not appear anywhere,
   simply omit it (do not invent work for it).
6. Do NOT include the student's name or any identifying text — refer to nothing by name.
7. SCRATCH PAGES: ${scratchPages.length > 0 ? `page(s) ${scratchPages.join(", ")} are rough/scratch work.` : "none are marked."}
   Transcribe legible work found ONLY on a scratch page under the question it belongs to, but prefix each
   such step's text with "[scratch] ". Scratch steps are shown to the teacher and are NOT graded.
8. CROSSED-OUT WORK: when the student struck through, scribbled over or otherwise cancelled a line,
   transcribe it as its own step with the text prefixed "[crossed out] ". Never drop it silently — the
   teacher needs to see it was there — and never merge it into the step above or below. The student
   rejected that work, so it earns no credit later (the teacher removes the prefix to count a step she
   decides was not really cancelled).

Return ONLY strict JSON: an array of objects, one per question you found, each exactly:
{
  "questionNumber": "<string, e.g. \\"1\\" or \\"2a\\">",
  "steps": [ { "text": "<string>", "confident": <true|false> } ],
  "illegible": [ { "stepIndex": <number>, "note": "<string>" } ],
  "blank": <true|false>
}
No prose, no code fences — just the JSON array.`;
}

/**
 * DP variant of the transcription prompt. Identical rules to the MYP prompt but:
 * names the DP course, lists each question WITH its mark-scheme sub-parts, and
 * asks the model to transcribe per sub-part, prefixing each step with the
 * sub-part label ("(a)", "(b)(i)") when it can tell which part the work belongs
 * to. The questionNumber stays the top-level number so downstream matching is
 * unchanged.
 */
function buildDpPrompt(pseudonym: string, questions: QuestionRow[], scratchPages: number[]): string {
  const questionList = questions
    .map((q) => {
      const labels = (q.dp_scheme?.subparts ?? [])
        .map((sp) => sp.label)
        .filter((l) => l && l.trim() !== "");
      const parts =
        labels.length > 0 ? ` — sub-parts: ${labels.map((l) => `(${l})`).join(", ")}` : "";
      return `- Question ${q.number}${parts}`;
    })
    .join("\n");
  return `You are transcribing a scanned, handwritten IB DP Mathematics: Applications and Interpretation assessment for student ${pseudonym}.
The pages are provided as images (read them with your Read tool). Page 1's name area has been masked.

Your ONLY job is to faithfully reconstruct what the student actually wrote, question by question.
You are NOT grading and you must NOT solve the problems yourself.

THE ASSESSMENT CONTAINS THESE QUESTIONS (with their mark-scheme sub-parts):
${questionList}

RULES — read carefully:
1. Transcribe the student's work per question as a list of short steps. Each step is one line of plain
   text or simple LaTeX-ish notation (e.g. "sin(x) = 3/5", "x^2 - 4 = 0", "area = 1/2 * b * h").
1b. SUB-PARTS: when you can tell which sub-part a step belongs to, prefix that step's text with the
   sub-part label in parentheses, e.g. "(a) mean = 10", "(b)(i) gradient = 2". If a question has no
   sub-parts, or you cannot tell, write the step without a prefix. Keep every step under its top-level
   question number.
2. NEVER GUESS. If a symbol, digit, or exponent is unreadable, DO NOT infer what it "should" be.
   Instead: put a "[?]" placeholder in that step's text where the unreadable part is, AND add an entry
   to that question's "illegible" array: {stepIndex, note}. Example note: "cannot read exponent in step 3".
   stepIndex is the 0-based index of the affected step within that question's steps array.
3. Mark each step confident:true only if you can read every character in it. If a step contains a "[?]"
   placeholder or you are unsure of any character, set confident:false.
4. If a question has no written work at all, set blank:true and use an empty steps array.
5. Only include questions you actually find in the scan. If a listed question does not appear anywhere,
   simply omit it (do not invent work for it).
6. Do NOT include the student's name or any identifying text — refer to nothing by name.
7. SCRATCH PAGES: ${scratchPages.length > 0 ? `page(s) ${scratchPages.join(", ")} are rough/scratch work.` : "none are marked."}
   Transcribe legible work found ONLY on a scratch page under the question it belongs to, but prefix each
   such step's text with "[scratch] ". Scratch steps are shown to the teacher and are NOT graded.
8. CROSSED-OUT WORK: when the student struck through, scribbled over or otherwise cancelled a line,
   transcribe it as its own step with the text prefixed "[crossed out] ". Never drop it silently — the
   teacher needs to see it was there — and never merge it into the step above or below. The student
   rejected that work, so it earns no credit later (the teacher removes the prefix to count a step she
   decides was not really cancelled).

Return ONLY strict JSON: an array of objects, one per question you found, each exactly:
{
  "questionNumber": "<string, e.g. \\"1\\" or \\"2\\">",
  "steps": [ { "text": "<string>", "confident": <true|false> } ],
  "illegible": [ { "stepIndex": <number>, "note": "<string>" } ],
  "blank": <true|false>
}
No prose, no code fences — just the JSON array.`;
}

/**
 * The warnings transcription produces, recognised by the wording each site below
 * emits. A re-run owns all of them: it clears them and writes whatever this pass
 * actually found.
 */
const TRANSCRIPTION_WARNING_MARKERS = [
  "not found in scan — possible missing page",
  "transcribed as sub-parts",
  "not found, but sub-parts",
  "Privacy scrub: model output contained roster name",
];

function isTranscriptionWarning(warning: string): boolean {
  return TRANSCRIPTION_WARNING_MARKERS.some((marker) => warning.includes(marker));
}

/** Transcribe one submission's handwritten work into per-question TranscriptQuestion rows. */
export async function transcribeSubmission(submissionId: number): Promise<TranscribeResult> {
  const submission = getSubmission(submissionId);
  if (!submission) throw new Error(`transcribe: submission ${submissionId} not found`);
  if (submission.status === "absent") {
    throw new Error(`transcribe: submission ${submissionId} is marked absent`);
  }
  if (submission.student_id == null) {
    throw new Error(`transcribe: submission ${submissionId} has no student assigned`);
  }
  const student = getStudent(submission.student_id);
  if (!student) throw new Error(`transcribe: student ${submission.student_id} not found`);

  const assessment = getAssessment(submission.assessment_id);
  if (!assessment) throw new Error(`transcribe: assessment ${submission.assessment_id} not found`);
  const questions = questionsForStudent(listQuestions(assessment.id), student);
  if (questions.length === 0) {
    throw new Error(`transcribe: assessment ${assessment.id} has no questions defined`);
  }

  const forbiddenNames = getForbiddenNames(student.class_id);
  const imagePaths = resolvePageImages(submission);
  // Scratch pages are excluded from imagePaths above, so the prompt is told none are
  // present (there is no [scratch] work to transcribe from images we didn't send).
  const prompt = buildPrompt(student.pseudonym, questions, [], assessment.programme);

  const parsed = await runClaudeJson<TranscriptQuestion[]>({
    purpose: "transcribe",
    prompt,
    imagePaths,
    forbiddenNames,
  });
  if (!Array.isArray(parsed)) {
    throw new Error(`transcribe: expected a JSON array of questions, got ${typeof parsed}`);
  }

  // Index model output by question number for matching against the definition.
  const byNumber = new Map<string, TranscriptQuestion>();
  for (const q of parsed) {
    if (q && typeof q.questionNumber === "string") byNumber.set(q.questionNumber.trim(), q);
  }

  const definedNumbers = new Set(questions.map((q) => q.number.trim()));
  // This run re-derives every warning transcription owns, so the previous run's
  // copies are dropped first. Carrying them over meant a second pass that finally
  // read the answers still showed "not found in scan" for every question, with no
  // way to clear it. Warnings owned by other stages (no name mask, page-count
  // sanity) are left exactly as they are.
  const warnings = new Set(
    (submission.warnings ?? []).filter((w) => !isTranscriptionWarning(w))
  );
  let saved = 0;

  for (const qRow of questions) {
    const number = qRow.number.trim();
    let found = byNumber.get(number);
    if (!found) {
      // The model may have split the question into sub-parts the definition
      // doesn't have ("4a" + "4b" for a defined "4") — merge instead of
      // silently dropping that work.
      const reconciled = reconcileSubParts(number, byNumber, definedNumbers);
      if (reconciled.kind === "merged") {
        warnings.add(
          `Question ${qRow.number}: transcribed as sub-parts ${reconciled.from.join(", ")} — merged under question ${qRow.number}`
        );
        found = reconciled.question;
      } else {
        if (reconciled.kind === "unmergeable") {
          warnings.add(
            `Question ${qRow.number} not found, but sub-parts ${reconciled.keys.join("/")} were transcribed — define sub-part questions or merge`
          );
        } else {
          // In the definition but absent from the scan — possible missing page.
          warnings.add(`Question ${qRow.number} not found in scan — possible missing page`);
        }
        // Persist a blank placeholder so downstream stages have a consistent row.
        upsertTranscript({
          submission_id: submission.id,
          question_id: qRow.id,
          content: { questionNumber: qRow.number, steps: [], illegible: [], blank: true },
        });
        saved++;
        continue;
      }
    }

    // Normalize + privacy-scrub the transcribed content (math should be name-free,
    // but we belt-and-brace every stored string against a leaked name).
    const normalized = normalizeQuestion(found, qRow.number, forbiddenNames, warnings);
    upsertTranscript({
      submission_id: submission.id,
      question_id: qRow.id,
      content: normalized,
    });
    saved++;
  }

  const warningList = [...warnings];
  updateSubmission(submission.id, { status: "transcribed", warnings: warningList.length ? warningList : null });

  return { submissionId: submission.id, questionCount: saved, warnings: warningList };
}

function normalizeQuestion(
  q: TranscriptQuestion,
  fallbackNumber: string,
  forbiddenNames: string[],
  warnings: Set<string>
): TranscriptQuestion {
  const steps = Array.isArray(q.steps)
    ? q.steps.map((s) => {
        const scrubbed = scrubOutput(String(s?.text ?? ""), forbiddenNames);
        scrubbed.warnings.forEach((w) => warnings.add(w));
        return { text: scrubbed.text, confident: Boolean(s?.confident) };
      })
    : [];
  const illegible = Array.isArray(q.illegible)
    ? q.illegible.map((f) => ({
        stepIndex: Number(f?.stepIndex ?? 0),
        note: String(f?.note ?? ""),
        ...(f?.resolvedText !== undefined ? { resolvedText: String(f.resolvedText) } : {}),
      }))
    : [];
  return {
    questionNumber: typeof q.questionNumber === "string" ? q.questionNumber : fallbackNumber,
    steps,
    illegible,
    blank: Boolean(q.blank) || steps.length === 0,
  };
}

/** Batch: transcribe several submissions sequentially (one CLI call at a time). */
export async function transcribeSubmissions(
  submissionIds: number[]
): Promise<{ results: TranscribeResult[]; errors: { submissionId: number; error: string }[] }> {
  const results: TranscribeResult[] = [];
  const errors: { submissionId: number; error: string }[] = [];
  for (const id of submissionIds) {
    try {
      results.push(await transcribeSubmission(id));
    } catch (err) {
      // One bad scan must not block the rest of the batch (spec edge case).
      errors.push({ submissionId: id, error: (err as Error).message });
    }
  }
  return { results, errors };
}
