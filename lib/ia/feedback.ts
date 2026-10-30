import "server-only";

import fs from "node:fs";
import path from "node:path";
import { runClaudeJson } from "@/lib/pipeline/run";
import { getForbiddenNames, scrubOutput } from "@/lib/pipeline/guards";
import {
  getIaChecklist,
  getIaCriterionNotes,
  getIaExploration,
  getLatestIaOutput,
  getLatestIaDocument,
  getStudent,
  insertIaOutput,
} from "@/lib/db/queries";
import { iaNotesPromptBlock } from "@/lib/ia/criterion-notes";
import { allRubricItems, parseRubricItems, rubricItemsPromptBlock } from "@/lib/ia/rubric-items";
import { mathCheckPromptBlock, runMathCheck } from "@/lib/ia/math-check";
import { IA_CRITERIA } from "@/lib/types";
import type { IaChecklistMark, IaDraftCriterionFeedback, IaDraftFeedback, IaMathCheck, IaOutputRow } from "@/lib/types";

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

/** Thrown when no draft document has been uploaded yet — the precondition for this call. */
export class MissingDraftError extends Error {}

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
  draftText: string,
  rubric: string,
  checklist: string,
  calibration: string,
  guideNotes: string,
  checklistItems: string,
  mathBlock: string
): string {
  return `You are giving IB Diploma Mathematics: Applications and Interpretation SL Internal Assessment
(Mathematical Exploration) DRAFT feedback. Author pseudonym: ${pseudonym}. This is the ONLY formal
feedback round the IB permits before final submission — be thorough, specific, and actionable. The
teacher will review and pass this on to the author, so refer to them ONLY as {{NAME}} — never write
any other name.

DRAFT STANCE — this is the moment to be demanding: surface every meaningful improvement that could
lift a band, even small ones, and describe the current level honestly (the final marking round is the
generous one; the draft is where you push). BUT judge the mathematics, not the English — most authors
are not native English speakers, so never lower a criterion for grammar or phrasing (see the
calibration notes).

Assess against these criteria (official maxima): ${criteriaSummary()}.

TEACHER'S ANNOTATED RUBRIC (primary reference — use ITS descriptors, not a generic IB rubric):
${rubric}
${guideNotes}${checklistBlock(checklist)}${calibration ? `\nTEACHER'S CALIBRATED STANDARDS (what each top band looks like; apply with the rubric):\n${calibration}\n` : ""}
RUBRIC CHECKLIST ITEMS (every bullet of the rubric above, each with an id):
${checklistItems}

DRAFT EXPLORATION TEXT (pseudonymized):
${draftText}
${mathBlock}
For EACH criterion A-E, decide the level the draft CURRENTLY evidences and justify it against the
rubric, then say exactly how to reach the next band. Provide:
- level: an integer 0..max — the level the draft currently earns on the evidence available
- evidence: an array of { "quote": "<short verbatim quote from the draft>", "location": "<page or
  section, e.g. 'p. 3' or 'Reflection'>" } — at least one item; each quote MUST appear in the draft
  text above. This is the evidence that grounds the level you chose.
- strengths: what is already working for this criterion, citing the evidence above
- gaps: what is missing to reach the NEXT band up, naming the SPECIFIC rubric descriptor for that
  higher level
- suggestions: concrete, actionable fixes the author can make before final submission to close those
  gaps
- checklist: the RUBRIC CHECKLIST ITEMS of this criterion (ids starting with its letter) whose
  statement is TRUE of the draft — "evident" when fully true, "partly" when partly true. Read each item
  as a statement about the draft, negative ones included: "No aim or rationale." is evident when the
  draft has no aim. Leave out every item that is not true of the draft. For each item listed give
  { "id": "<its id>", "status": "evident" | "partly", "quote": "<short verbatim quote from the draft
  showing it, or "" when the item is about something missing>", "location": "<page or section, or "">" }.
  Every quote MUST appear in the draft text above.

Also write:
- summary: a short overall cover note for the teacher (2-4 sentences)
- toddleComment: a warm, encouraging, student-facing paragraph (3-5 sentences) the teacher can paste
  into Toddle, addressed to {{NAME}}. Name the 1-2 most important next steps in plain language. No
  criterion letters, no marks, no jargon.

Return ONLY strict JSON matching exactly this shape (all five criteria, in order):
{
  "criteria": [
    { "criterion": "A", "level": <0-4>, "evidence": [{ "quote": "...", "location": "..." }], "strengths": ["..."], "gaps": ["..."], "suggestions": ["..."], "checklist": [{ "id": "...", "status": "evident", "quote": "...", "location": "..." }] },
    { "criterion": "B", "level": <0-4>, "evidence": [{ "quote": "...", "location": "..." }], "strengths": ["..."], "gaps": ["..."], "suggestions": ["..."], "checklist": [{ "id": "...", "status": "evident", "quote": "...", "location": "..." }] },
    { "criterion": "C", "level": <0-3>, "evidence": [{ "quote": "...", "location": "..." }], "strengths": ["..."], "gaps": ["..."], "suggestions": ["..."], "checklist": [{ "id": "...", "status": "evident", "quote": "...", "location": "..." }] },
    { "criterion": "D", "level": <0-3>, "evidence": [{ "quote": "...", "location": "..." }], "strengths": ["..."], "gaps": ["..."], "suggestions": ["..."], "checklist": [{ "id": "...", "status": "evident", "quote": "...", "location": "..." }] },
    { "criterion": "E", "level": <0-6>, "evidence": [{ "quote": "...", "location": "..." }], "strengths": ["..."], "gaps": ["..."], "suggestions": ["..."], "checklist": [{ "id": "...", "status": "evident", "quote": "...", "location": "..." }] }
  ],
  "summary": "<string>",
  "toddleComment": "<string>"
}
No prose, no code fences.`;
}

function clampLevel(n: number, max: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(max, Math.round(n)));
}

function scrubChecklist(
  criterion: string,
  marks: unknown,
  knownIds: Set<string>,
  forbiddenNames: string[]
): IaChecklistMark[] {
  if (!Array.isArray(marks)) return [];
  const seen = new Set<string>();
  const out: IaChecklistMark[] = [];
  for (const m of marks as Partial<IaChecklistMark>[]) {
    const id = String(m?.id ?? "").trim();
    // Only real items of this criterion, once each, with a status the screen knows.
    if (!knownIds.has(id) || !id.startsWith(criterion) || seen.has(id)) continue;
    if (m.status !== "evident" && m.status !== "partly") continue;
    seen.add(id);
    out.push({
      id,
      status: m.status,
      quote: scrubOutput(m.quote ?? "", forbiddenNames).text,
      location: scrubOutput(m.location ?? "", forbiddenNames).text,
    });
  }
  return out;
}

/**
 * A regenerated draft feedback keeps what the teacher wrote on the previous one:
 * each criterion's comment, and each checklist item's status override and comment.
 */
export function carryTeacherInput(next: IaDraftFeedback, previous: IaDraftFeedback | undefined): IaDraftFeedback {
  if (!previous) return next;
  return {
    ...next,
    criteria: next.criteria.map((c) => {
      const old = previous.criteria?.find((p) => p.criterion === c.criterion);
      if (!old) return c;
      const byId = new Map((c.checklist ?? []).map((m) => [m.id, { ...m }]));
      for (const om of old.checklist ?? []) {
        if (!om.teacherStatus && !om.comment) continue;
        const m: IaChecklistMark = byId.get(om.id) ?? { id: om.id };
        // An override the new judgement now agrees with is no longer an override.
        if (om.teacherStatus && om.teacherStatus !== (m.status ?? "not_evident")) m.teacherStatus = om.teacherStatus;
        if (om.comment) m.comment = om.comment;
        byId.set(om.id, m);
      }
      return {
        ...c,
        checklist: [...byId.values()],
        ...(old.teacherComment ? { teacherComment: old.teacherComment } : {}),
      };
    }),
  };
}

function scrubDraftFeedback(
  fb: IaDraftFeedback,
  forbiddenNames: string[],
  knownIds: Set<string> = new Set()
): IaDraftFeedback {

  const criteria: IaDraftCriterionFeedback[] = (fb.criteria ?? []).map((c) => ({
    criterion: c.criterion,
    level: clampLevel(c.level ?? 0, MAX_BY_CRITERION[c.criterion] ?? 0),
    evidence: (c.evidence ?? []).map((e) => ({
      quote: scrubOutput(e.quote ?? "", forbiddenNames).text,
      location: scrubOutput(e.location ?? "", forbiddenNames).text,
    })),
    strengths: (c.strengths ?? []).map((s) => scrubOutput(s, forbiddenNames).text),
    gaps: (c.gaps ?? []).map((s) => scrubOutput(s, forbiddenNames).text),
    suggestions: (c.suggestions ?? []).map((s) => scrubOutput(s, forbiddenNames).text),
    checklist: scrubChecklist(c.criterion, c.checklist, knownIds, forbiddenNames),
  }));
  return {
    criteria,
    summary: scrubOutput(fb.summary ?? "", forbiddenNames).text,
    toddleComment: scrubOutput(fb.toddleComment ?? "", forbiddenNames).text,
  };
}

/**
 * Generates draft feedback for an exploration's latest uploaded draft
 * document (must already be pseudonymized text — see lib/ia/extract.ts) and
 * persists it as a new ia_outputs row (kind: 'draft_feedback', status: 'draft').
 */
export async function generateDraftFeedback(explorationId: number): Promise<IaOutputRow> {
  const exploration = getIaExploration(explorationId);
  if (!exploration) throw new Error(`generateDraftFeedback: exploration ${explorationId} not found`);
  const student = getStudent(exploration.student_id);
  if (!student) throw new Error(`generateDraftFeedback: student not found`);
  const draft = getLatestIaDocument(explorationId, "draft");
  if (!draft || !draft.text) {
    throw new MissingDraftError("No draft document uploaded yet — upload one before generating feedback.");
  }

  const forbiddenNames = getForbiddenNames(student.class_id);
  const rubric = loadRubric();
  const checklist = getIaChecklist();
  const calibration = loadCalibration();
  const guideNotes = iaNotesPromptBlock(getIaCriterionNotes());
  const rubricItems = parseRubricItems(rubric);
  const knownIds = new Set(allRubricItems(rubricItems).keys());

  // The mathematics is checked first, on the page images, so criterion E can use it.
  // If it fails, the rest of the feedback still goes ahead and the screen says so.
  let mathCheck: IaMathCheck | undefined;
  let mathCheckError: string | undefined;
  try {
    mathCheck = await runMathCheck({ explorationId, doc: draft, pseudonym: student.pseudonym, forbiddenNames });
  } catch (err) {
    mathCheckError = (err as Error).message;
  }

  const raw = await runClaudeJson<IaDraftFeedback>({
    purpose: "ia-draft-feedback",
    forbiddenNames,
    prompt: buildPrompt(student.pseudonym, draft.text, rubric, checklist, calibration, guideNotes, rubricItemsPromptBlock(rubricItems), mathCheckPromptBlock(mathCheck)),
  });

  const previous = getLatestIaOutput(explorationId, "draft_feedback")?.content as IaDraftFeedback | undefined;
  const scrubbed = carryTeacherInput(scrubDraftFeedback(raw, forbiddenNames, knownIds), previous);
  return insertIaOutput({
    exploration_id: explorationId,
    kind: "draft_feedback",
    content: {
      ...scrubbed,
      ...(mathCheck ? { mathCheck } : {}),
      ...(mathCheckError ? { mathCheckError } : {}),
    },
    status: "draft",
  });
}
