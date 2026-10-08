import "server-only";

import { displayStoredPath, resolveStoredPath } from "@/lib/assessment/file-paths";

import fs from "node:fs";
import {
  getAssessment,
  insertQuestion,
  listQuestions,
  setQuestionDpScheme,
  updateQuestion,
} from "@/lib/db/queries";
import type { DpQuestionScheme, DpSchemeMark, DpSubpart } from "@/lib/types";
import { getForbiddenNames } from "@/lib/pipeline/guards";
import { runClaudeJson } from "@/lib/pipeline/run";
import { extractFileText } from "@/lib/assessment/extract-text";
import { clearParseApproved, ensureDpDir, examinerInstructionsPath } from "@/lib/assessment/dp-paths";

export type MsParseResult = {
  assessmentId: number;
  questionCount: number;
  totalMarks: number;
  examinerInstructionsSaved: boolean;
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Instructions to Examiners detection (local, deterministic — see P4b).
// The official IB markscheme front matter is a run of pages starting at a page
// containing the "Instructions to Examiners" heading, and ending right before
// the first page of actual question content. Every question page in the real
// papers ends with a "[Total: N marks]" annotation; no Instructions page does,
// so that annotation is a reliable boundary marker.
// ---------------------------------------------------------------------------

function detectExaminerInstructions(pages: string[]): { text: string | null; endIdx: number } {
  const startIdx = pages.findIndex((p) => /instructions\s+to\s+examiners/i.test(p));
  if (startIdx === -1) return { text: null, endIdx: 0 };

  let endIdx = pages.findIndex(
    (p, i) => i > startIdx && /\[\s*total\s*:/i.test(p)
  );
  if (endIdx === -1) endIdx = startIdx + 1; // fallback: just the heading page

  return { text: pages.slice(startIdx, endIdx).join("\n\n"), endIdx };
}

// ---------------------------------------------------------------------------
// LLM structuring
// ---------------------------------------------------------------------------

type RawMark = {
  code: string;
  implied: boolean;
  ft: boolean;
  value: number;
  descriptor: string;
  alt?: string | null;
};

type RawSubpart = {
  label: string;
  maxMarks: number;
  scheme: string;
  marks: RawMark[];
  notes: string[];
};

type RawQuestion = {
  number: string;
  totalMarks: number;
  subparts: RawSubpart[];
};

function buildPrompt(documentText: string): string {
  return `You are structuring an official IB Diploma Programme mathematics markscheme into
strict JSON so a separate grading tool can mark student work against it mark-by-mark.

The full extracted text of the markscheme document follows below (PDF text extraction, so
spacing/line-wrapping may be imperfect — reconstruct the mathematical meaning, do not
transcribe raw whitespace artifacts).

--- DOCUMENT TEXT START ---
${documentText}
--- DOCUMENT TEXT END ---

TASK: emit one JSON object per genuine, numbered top-level question (1, 2, 3, ...) that has
marks awarded (i.e. it ends with a "[Total: N marks]" annotation in the source). Ignore any
front matter, instructions, abbreviation legends, or cover/copyright pages — those are not
questions.

For EACH question, produce:
{
  "number": "<top-level question number as a string, e.g. \\"1\\">",
  "totalMarks": <number, from the question's "[Total: N marks]" annotation>,
  "subparts": [ <see below>, ... ]
}

A question with no lettered sub-parts still gets exactly one subpart entry with "label": "".
Nested sub-parts use dot notation for the label, e.g. "b.i", "b.ii" for part (b)(i), (b)(ii).

Each subpart:
{
  "label": "<'a' | 'b.i' | '' etc — '' only if the question has no sub-parts at all>",
  "maxMarks": <number, from that sub-part's "[N marks]" annotation>,
  "scheme": "<verbatim reconstruction of the sub-part's mathematical/textual content: the
             answer, alternative equivalent forms given in parentheses after the answer, and
             the literal structural labels METHOD 1 / METHOD 2 / EITHER / OR / THEN when
             present, reproduced in reading order. Do NOT include the mark-code annotations
             (M1, A1, R1, AG, etc.) inside this string — those go in the marks array below.>",
  "marks": [ <see below>, ... ],
  "notes": [ "<verbatim text of each 'Note:' box for this sub-part, prefix removed>", ... ]
}

MARK NOTATION RULES — read carefully, these preserve the official IB grading semantics:
- "code" preserves the EXACT notation as printed, including parentheses for implied marks and
  the "ft" suffix for follow-through marks, e.g. "M1", "(M1)", "A1", "A2", "R1", "A1ft", "AG".
- "implied" is true iff the code was written in parentheses, e.g. (M1) -> implied:true, code:"(M1)".
- "ft" is true iff the code carries the "ft" follow-through suffix, e.g. "A1ft" -> ft:true.
- "value" is the numeric mark value: a bare letter+digit code's value is that digit (A2 -> 2,
  M1 -> 1, R1 -> 1); "AG" (answer given — no marks awarded) -> value 0.
- CRITICAL — SPLIT combined codes printed on the same line into SEPARATE mark entries, one per
  code, each keeping its own descriptor text: "M1A1" on one line becomes TWO entries, one with
  code "M1" and one with code "A1". "A0A1A1" becomes THREE entries: "A0", "A1", "A1". Never merge
  multiple codes into one entry, and never split a single code like "A2" into two A1s.
- "descriptor" is a short plain-English description of what that specific mark is awarded for
  (paraphrase the surrounding scheme text for that mark; do not just repeat the code).
- "alt" groups MUTUALLY EXCLUSIVE alternative marks that a student earns via only ONE of several
  valid paths: marks appearing under "METHOD 1" vs "METHOD 2" for the same question, or under
  "EITHER" vs "OR" for the same step, should share the same "alt" group id (e.g. "b-methodA" for
  every METHOD 1/METHOD 2 mark solving the same sub-part, "c-branch" for an EITHER/OR pair). Marks
  that follow a "THEN" (i.e. apply regardless of which EITHER/OR branch was taken) are NOT part of
  that alt group — but if THEN is itself followed by another EITHER/OR, give THOSE marks a second,
  different alt group. Marks with no alternative path get no "alt" field at all.

Return ONLY a strict JSON array of question objects (as described above), no prose, no code fences.`;
}

function normalizeLabel(label: unknown): string {
  return typeof label === "string" ? label.trim() : "";
}

function toRawQuestions(parsed: unknown): RawQuestion[] {
  if (!Array.isArray(parsed)) {
    throw new Error(`ms-parse: expected a JSON array of questions, got ${typeof parsed}`);
  }
  return parsed as RawQuestion[];
}

/** Assigns stable per-subpart mark ids (e.g. "a-1", "a-2", "b.i-1") after LLM structuring. */
function toDpSubpart(raw: RawSubpart): DpSubpart {
  const label = normalizeLabel(raw.label);
  const marks: DpSchemeMark[] = (Array.isArray(raw.marks) ? raw.marks : []).map((m, idx) => ({
    id: `${label || "q"}-${idx + 1}`,
    code: String(m.code ?? "").trim(),
    implied: Boolean(m.implied),
    ft: Boolean(m.ft),
    value: Number.isFinite(m.value) ? Number(m.value) : 0,
    descriptor: String(m.descriptor ?? "").trim(),
    ...(m.alt ? { alt: String(m.alt) } : {}),
  }));
  return {
    label,
    maxMarks: Number.isFinite(raw.maxMarks) ? Number(raw.maxMarks) : 0,
    scheme: String(raw.scheme ?? "").trim(),
    marks,
    notes: Array.isArray(raw.notes) ? raw.notes.map((n) => String(n).trim()).filter(Boolean) : [],
  };
}

function toDpQuestionScheme(raw: RawQuestion): DpQuestionScheme {
  const subparts = (Array.isArray(raw.subparts) ? raw.subparts : []).map(toDpSubpart);
  return {
    subparts,
    totalMarks: Number.isFinite(raw.totalMarks) ? Number(raw.totalMarks) : 0,
  };
}

/**
 * Parses the assessment's uploaded markscheme file into per-question DpQuestionScheme rows
 * (spec P4). Text extraction is local/deterministic (lib/assessment/extract-text.ts); the IB
 * notation is structured by the CLI via runClaudeJson. Instructions to Examiners pages, if
 * present, are saved verbatim to the fixed contract path the DP grading engine reads from.
 *
 * Re-running this (e.g. after a re-upload) replaces existing questions' dp_scheme by matching
 * on question "number", and clears any prior parse approval — the teacher must re-approve.
 */
export async function parseMarkscheme(assessmentId: number): Promise<MsParseResult> {
  const assessment = getAssessment(assessmentId);
  if (!assessment) throw new Error(`ms-parse: assessment ${assessmentId} not found`);
  if (assessment.programme !== "DP") {
    throw new Error(`ms-parse: assessment ${assessmentId} is not a DP assessment`);
  }
  if (!assessment.markscheme_file) {
    throw new Error("ms-parse: no markscheme uploaded for this assessment");
  }
  const markschemePath = resolveStoredPath(assessment.markscheme_file);
  if (!markschemePath) {
    throw new Error(
      `ms-parse: the uploaded markscheme is missing from data/ (recorded as "${displayStoredPath(
        assessment.markscheme_file
      )}"). Upload it again in setup.`
    );
  }

  const pages = await extractFileText(markschemePath);
  const fullText = pages.join("\n\n");

  const { text: instructionsText } = detectExaminerInstructions(pages);
  let examinerInstructionsSaved = false;
  ensureDpDir(assessmentId);
  if (instructionsText) {
    fs.writeFileSync(examinerInstructionsPath(assessmentId), instructionsText, "utf-8");
    examinerInstructionsSaved = true;
  }

  const forbiddenNames = getForbiddenNames();
  const prompt = buildPrompt(fullText);
  const parsed = await runClaudeJson<unknown>({
    purpose: "ms-parse",
    prompt,
    forbiddenNames,
  });
  const rawQuestions = toRawQuestions(parsed);
  if (rawQuestions.length === 0) {
    throw new Error(
      "ms-parse: the model returned no questions — check the markscheme file and try again, or edit the parse manually."
    );
  }

  const warnings: string[] = [];
  const existingByNumber = new Map(listQuestions(assessmentId).map((q) => [q.number.trim(), q]));
  let totalMarks = 0;

  for (const raw of rawQuestions) {
    const number = String(raw.number ?? "").trim();
    if (!number) {
      warnings.push("ms-parse: skipped a question with no number in the model's response.");
      continue;
    }
    const scheme = toDpQuestionScheme(raw);
    totalMarks += scheme.totalMarks;

    const existing = existingByNumber.get(number);
    if (existing) {
      updateQuestion(existing.id, { max_points: scheme.totalMarks });
      setQuestionDpScheme(existing.id, scheme);
    } else {
      const created = insertQuestion({
        assessment_id: assessmentId,
        number,
        max_points: scheme.totalMarks,
        level_band: null,
        dp_scheme: scheme,
      });
      existingByNumber.set(number, created);
    }
  }

  // A re-parse invalidates any previous approval — the teacher must review the new structure.
  clearParseApproved(assessmentId);

  return {
    assessmentId,
    questionCount: rawQuestions.length,
    totalMarks,
    examinerInstructionsSaved,
    warnings,
  };
}

/** Re-fetches the persisted DpQuestionScheme rows for an assessment (setup editor view). */
export function getParsedQuestions(assessmentId: number) {
  return listQuestions(assessmentId).filter((q) => q.dp_scheme !== null);
}
