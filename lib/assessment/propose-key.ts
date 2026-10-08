import "server-only";

import {
  getAssessment,
  getClass,
  insertWorkedSolution,
  listQuestions,
  listWorkedSolutions,
  updateWorkedSolution,
} from "@/lib/db/queries";
import { getForbiddenNames } from "@/lib/pipeline/guards";
import { runClaudeJson } from "@/lib/pipeline/run";
import { readPaperText } from "./paper-extract";

/**
 * Proposes the answer key for a points-only test from the blank paper, for
 * the teacher to approve or edit before any student work is graded.
 *
 * The proposal is written into the same worked-solution fields the grader
 * already reads — general marking rules in the whole-assessment box, one
 * solution per question underneath — so approving it is just reading it.
 * When the teacher has uploaded her own key (the whole-assessment box already
 * has text), that key is the authority and the proposal only organises it per
 * question and fills the gaps.
 */

const MAX_PAPER_CHARS = 16000;
const MAX_KEY_CHARS = 16000;

type ProposedItem = { number: string; solution: string };
type Proposal = { generalRules: string; questions: ProposedItem[] };

export type ProposeKeyResult = {
  /** Questions that received a proposed solution. */
  proposed: number;
  /** Questions on the assessment the proposal did not cover. */
  uncovered: string[];
  usedVision: boolean;
  /** The teacher's uploaded key was used as the source of truth. */
  fromTeacherKey: boolean;
};

/** "Grade 12 Financial Math", or just "Grade 9" for a class with no course named. */
function testCourseName(assessment: { class_id: number | null; grade: number }): string {
  const cls = assessment.class_id !== null ? getClass(assessment.class_id) : undefined;
  return `Grade ${assessment.grade}${cls?.course ? ` ${cls.course}` : ""}`;
}

function buildPrompt(args: {
  /** "Grade 12 Financial Math", "Grade 9" — what the test is for, in the teacher's words. */
  courseName: string;
  paperText: string;
  teacherKey: string | null;
  questions: { number: string; maxPoints: number }[];
}): string {
  const { courseName, paperText, teacherKey, questions } = args;
  const list = questions.map((q) => `- "${q.number}" (${q.maxPoints} point${q.maxPoints === 1 ? "" : "s"})`).join("\n");
  return `You are preparing the ANSWER KEY for a ${courseName} mathematics test that is scored as
points out of a total. The teacher will approve or edit every line before it is used, so be precise,
and say when you are unsure rather than guessing.

${
    teacherKey
      ? `THE TEACHER'S OWN KEY is below. It is the authority: reproduce its answers, mark allocations and
rubrics exactly, organised per question. Only where it is silent, propose a solution yourself and mark
that line "(proposed — please check)".

--- TEACHER'S KEY START ---
${teacherKey}
--- TEACHER'S KEY END ---
`
      : `No key was provided: work every question yourself, showing the calculation, and mark any answer
you are not certain of "(please check)".
`
  }
--- TEST PAPER START ---
${paperText}
--- TEST PAPER END ---

THE QUESTIONS TO COVER, with their points (use these labels exactly):
${list}

For EACH question write a solution the grader can mark against:
- Multiple choice: the correct option letter and a one-line reason.
- Calculation: the working step by step with the final value(s), and how the points split
  (e.g. "1 pt correct net flow, 1 pt equation, 1 pt month-6 value"). Accept any method — formula,
  GDC (including its finance solver), or spreadsheet — that reaches the same values; say so where relevant.
  Note common wrong answers and what they earn (e.g. sign error on the slope: 0 for that part).
- Short answer / explanation: the points the answer must make, and a level-by-level rubric
  (e.g. "5: ... 4: ... 3: ... 2: ... 1: ... 0: ...") if the paper or key gives one; otherwise a
  brief marking guide.
Also write GENERAL RULES for the whole paper: how partial credit and follow-through work, rounding,
units, what a blank earns, and anything the key says applies everywhere.

Return ONLY strict JSON, no prose, no code fences:
{
  "generalRules": "<string>",
  "questions": [ { "number": "<label exactly as listed>", "solution": "<string>" } ]
}`;
}

export async function proposeAnswerKey(assessmentId: number): Promise<ProposeKeyResult> {
  const assessment = getAssessment(assessmentId);
  if (!assessment) throw new Error("Assessment not found.");
  if (!assessment.paper_file) throw new Error("Upload the blank test paper first.");
  const questions = listQuestions(assessmentId);
  if (questions.length === 0) throw new Error("Add the questions first (upload the paper to fill them in).");

  const paper = await readPaperText(assessment.paper_file);
  const existing = listWorkedSolutions(assessmentId);
  const whole = existing.find((ws) => ws.question_id === null);
  const teacherKey = whole?.content.trim() ? whole.content.trim().slice(0, MAX_KEY_CHARS) : null;

  const parsed = await runClaudeJson<Proposal>({
    purpose: "fm-propose-key",
    prompt: buildPrompt({
      courseName: testCourseName(assessment),
      paperText: paper.text.slice(0, MAX_PAPER_CHARS),
      teacherKey,
      questions: questions.map((q) => ({ number: q.number, maxPoints: q.max_points })),
    }),
    forbiddenNames: getForbiddenNames(),
  });

  const byNumber = new Map(
    (Array.isArray(parsed.questions) ? parsed.questions : []).map((q) => [
      String(q.number ?? "").trim().toLowerCase(),
      String(q.solution ?? "").trim(),
    ])
  );
  const perQuestion = new Map(
    existing.filter((ws) => ws.question_id !== null).map((ws) => [ws.question_id as number, ws])
  );

  let proposed = 0;
  const uncovered: string[] = [];
  for (const q of questions) {
    const solution = byNumber.get(q.number.trim().toLowerCase());
    if (!solution) {
      uncovered.push(q.number);
      continue;
    }
    const row = perQuestion.get(q.id);
    if (row) updateWorkedSolution(row.id, solution);
    else insertWorkedSolution({ assessment_id: assessmentId, question_id: q.id, content: solution });
    proposed++;
  }

  // The teacher's own key stays as she wrote it; only an empty box gets the
  // proposed general rules, so the grader has something whole-paper to read.
  const rules = String(parsed.generalRules ?? "").trim();
  if (!teacherKey && rules) {
    if (whole) updateWorkedSolution(whole.id, rules);
    else insertWorkedSolution({ assessment_id: assessmentId, question_id: null, content: rules });
  }

  return { proposed, uncovered, usedVision: paper.usedVision, fromTeacherKey: teacherKey !== null };
}
