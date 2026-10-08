import "server-only";

import fs from "node:fs";
import path from "node:path";
import { runClaudeJson } from "@/lib/pipeline/run";
import { getForbiddenNames, scrubOutput } from "@/lib/pipeline/guards";
import {
  getIaChecklist,
  getIaExploration,
  getLatestIaDocument,
  getStudent,
  insertIaOutput,
} from "@/lib/db/queries";
import { IA_CRITERIA } from "@/lib/types";
import type { IaAuthenticity, IaCriterionMark, IaFinalMarks, IaOutputRow } from "@/lib/types";

const RUBRIC_PATH = path.join(process.cwd(), "specs", "reference", "exploration-rubric-sl-v1.4.txt");
const CALIBRATION_PATH = path.join(process.cwd(), "specs", "reference", "ia-calibration-notes.md");

function loadRubric(): string {
  return fs.readFileSync(RUBRIC_PATH, "utf-8");
}

function loadCalibration(): string {
  try {
    return fs.readFileSync(CALIBRATION_PATH, "utf-8");
  } catch {
    return "";
  }
}

/** Thrown when no final document has been uploaded yet — the precondition for this call. */
export class MissingFinalError extends Error {}

const MAX_BY_CRITERION: Record<string, number> = Object.fromEntries(
  IA_CRITERIA.map((c) => [c.key, c.max])
);

function criteriaSummary(): string {
  return IA_CRITERIA.map((c) => `${c.key} (${c.name}) — max ${c.max}`).join("; ");
}

function checklistBlock(checklist: string): string {
  const trimmed = checklist.trim();
  if (!trimmed) return "";
  return `\nTEACHER'S PERSONAL CHECKLIST (apply this in addition to the rubric; where it is more
specific than the rubric, follow it):\n${trimmed}\n`;
}

function buildPrompt(
  pseudonym: string,
  finalText: string,
  rubric: string,
  checklist: string,
  calibration: string
): string {
  return `You are marking the FINAL submission of an IB Diploma Mathematics: Applications and
Interpretation SL Internal Assessment (Mathematical Exploration). Author pseudonym: ${pseudonym}.
Refer to the author ONLY as {{NAME}} — never write any other name.

Assess against these criteria (official maxima): ${criteriaSummary()}. Total is out of 20.

TEACHER'S ANNOTATED RUBRIC (primary reference — use ITS descriptors, not a generic IB rubric):
${rubric}
${checklistBlock(checklist)}${calibration ? `\nTEACHER'S CALIBRATED STANDARDS (apply these together with the rubric):\n${calibration}\n` : ""}
MARKING RULE — generous within the rubric (teacher's standing rule for FINAL marking): actively look
for the evidence that JUSTIFIES the higher of two adjacent bands, and award it whenever the rubric's
descriptor for that band is genuinely met. Resolve honest ambiguity UPWARD, not downward. This is not
licence to invent: every mark must still be supported by evidence you can quote, and you must never
exceed what the rubric describes — but do not withhold a band the work has earned. Remember most
authors are not native English speakers; never lower a criterion for language (see the calibration
notes).

FINAL EXPLORATION TEXT (pseudonymized):
${finalText}

For EACH criterion A-E, propose an integer mark (within the official maximum) with:
- evidence: an array of { "quote": "<short quote from the exploration>", "location": "<page or
  section, e.g. 'p. 4' or 'Section 2'>" } — at least one item, quoting the actual text
- justification: why this mark, argued against the rubric's level descriptors

Also write:
- toddleComment: a warm, student-facing paragraph (3-5 sentences), addressed to {{NAME}}, the teacher
  can paste into Toddle. Recognise what was done well and name 1-2 things to build on. No criterion
  letters, no marks, no jargon.
- authenticity: a teacher-only integrity check. This is NOT an accusation and NOT a
  plagiarism/AI-detection verdict — you cannot and must not claim to detect either. Only note INTERNAL
  inconsistencies worth a second look: abrupt shifts in voice or register, or passages markedly more
  sophisticated than the surrounding work. Set level to "look" only if you genuinely see such a shift,
  otherwise "ok". In notes, describe what to look at and where, in neutral language ("the tone in
  Section 3 differs from the rest — worth confirming with {{NAME}}"). If level is "ok", notes may be [].

Return ONLY strict JSON matching exactly this shape (all five criteria, in order):
{
  "criteria": [
    { "criterion": "A", "proposed": <0-4>, "evidence": [{ "quote": "...", "location": "..." }], "justification": "..." },
    { "criterion": "B", "proposed": <0-4>, "evidence": [{ "quote": "...", "location": "..." }], "justification": "..." },
    { "criterion": "C", "proposed": <0-3>, "evidence": [{ "quote": "...", "location": "..." }], "justification": "..." },
    { "criterion": "D", "proposed": <0-3>, "evidence": [{ "quote": "...", "location": "..." }], "justification": "..." },
    { "criterion": "E", "proposed": <0-6>, "evidence": [{ "quote": "...", "location": "..." }], "justification": "..." }
  ],
  "total": <0-20>,
  "toddleComment": "<string>",
  "authenticity": { "level": "ok" | "look", "notes": ["..."] }
}
No prose, no code fences.`;
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Scrubs roster-name leaks from every string field and clamps each proposed
 * mark to its criterion's official maximum. The total is ALWAYS recomputed
 * from the (clamped) per-criterion marks — the model's own "total" field is
 * never trusted directly, so a clamp never leaves an inconsistent sum.
 */
function scrubAndClamp(marks: IaFinalMarks, forbiddenNames: string[]): IaFinalMarks {
  const criteria: IaCriterionMark[] = (marks.criteria ?? []).map((c) => {
    const max = MAX_BY_CRITERION[c.criterion] ?? 0;
    const proposed = clamp(Math.round(c.proposed ?? 0), 0, max);
    return {
      criterion: c.criterion,
      proposed,
      evidence: (c.evidence ?? []).map((e) => ({
        quote: scrubOutput(e.quote ?? "", forbiddenNames).text,
        location: scrubOutput(e.location ?? "", forbiddenNames).text,
      })),
      justification: scrubOutput(c.justification ?? "", forbiddenNames).text,
    };
  });
  const total = criteria.reduce((sum, c) => sum + c.proposed, 0);
  const authenticity = scrubAuthenticity(marks.authenticity, forbiddenNames);
  return {
    criteria,
    total,
    toddleComment: scrubOutput(marks.toddleComment ?? "", forbiddenNames).text,
    authenticity,
  };
}

function scrubAuthenticity(
  a: IaAuthenticity | undefined,
  forbiddenNames: string[]
): IaAuthenticity {
  const level = a?.level === "look" ? "look" : "ok";
  const notes = (a?.notes ?? []).map((n) => scrubOutput(n, forbiddenNames).text).filter(Boolean);
  return { level, notes };
}

/**
 * Generates final marks for an exploration's latest uploaded final document
 * (must already be pseudonymized text — see lib/ia/extract.ts) and persists
 * it as a new ia_outputs row (kind: 'final_marks', status: 'draft').
 */
export async function generateFinalMarks(explorationId: number): Promise<IaOutputRow> {
  const exploration = getIaExploration(explorationId);
  if (!exploration) throw new Error(`generateFinalMarks: exploration ${explorationId} not found`);
  const student = getStudent(exploration.student_id);
  if (!student) throw new Error(`generateFinalMarks: student not found`);
  const final = getLatestIaDocument(explorationId, "final");
  if (!final || !final.text) {
    throw new MissingFinalError("No final document uploaded yet — upload one before generating marks.");
  }

  const forbiddenNames = getForbiddenNames(student.class_id);
  const rubric = loadRubric();
  const checklist = getIaChecklist();
  const calibration = loadCalibration();

  const raw = await runClaudeJson<IaFinalMarks>({
    purpose: "ia-final-marks",
    forbiddenNames,
    prompt: buildPrompt(student.pseudonym, final.text, rubric, checklist, calibration),
  });

  const scrubbed = scrubAndClamp(raw, forbiddenNames);
  return insertIaOutput({
    exploration_id: explorationId,
    kind: "final_marks",
    content: scrubbed,
    status: "draft",
  });
}
