import "server-only";

import fs from "node:fs";
import path from "node:path";

import {
  getApplicableMarkingInstructions,
  getAssessment,
  getStudent,
  getSubmission,
  listQuestions,
  listTranscripts,
  updateSubmission,
  upsertGrading,
} from "@/lib/db/queries";
import type {
  DpGradingQuestion,
  DpGradingSubpart,
  DpMarkAward,
  DpQuestionScheme,
  DpSchemeMark,
  DpSubpart,
  GradingQuestion,
  QuestionRow,
  TranscriptQuestion,
} from "@/lib/types";
import { getForbiddenNames, scrubOutput } from "@/lib/pipeline/guards";
import { runClaudeJson } from "@/lib/pipeline/run";
import { recomputeAndPersistDpResult } from "@/lib/submissions/dp-grading";
import type { RunClaudeOptions } from "@/lib/ai/claude";

// ---------------------------------------------------------------------------
// Precondition error — mirrors lib/pipeline/grade.ts exactly (same shape/name)
// so the route can 409 with the same `unresolvedFlags` payload the MYP route
// uses. Behaviour is identical: an illegible flag with resolvedText===undefined
// still needs the teacher; resolvedText==="" means "ungradeable, no credit".
// ---------------------------------------------------------------------------

/** Thrown when the precondition fails: illegible flags still awaiting the teacher. */
export class UnresolvedFlagsError extends Error {
  flags: { questionNumber: string; stepIndex: number; note: string }[];
  constructor(flags: { questionNumber: string; stepIndex: number; note: string }[]) {
    super(`grade-dp: ${flags.length} illegible flag(s) still unresolved`);
    this.name = "UnresolvedFlagsError";
    this.flags = flags;
  }
}

// ---------------------------------------------------------------------------
// Default IB marking rules (spec P8 summary). Always included; the per-paper
// "Instructions to Examiners" (data/dp/<assessmentId>/examiner-instructions.txt)
// are appended on top when present.
// ---------------------------------------------------------------------------

export const DEFAULT_DP_RULES = `IB DP MATHEMATICS MARKING RULES (Instructions to Examiners — default summary).
Apply the mark scheme annotations literally. Never award full marks automatically for a correct final
answer — you must inspect ALL of the working.

M->A DEPENDENCY: in general do NOT award an A mark after an M0 on the same method — A marks depend on the
preceding M marks. "M1A1" on one line means M1 for the method attempt + A1 for the correct values. Two or
more A marks on the same line are independent of each other (A0A1A1 is possible). A2 / M2 / A3 are NOT
split into halves unless a Note says so.

IMPLIED MARKS "(M1)": award an implied mark only if the correct work is seen OR is clearly implied by the
subsequent development / final answer.

FOLLOW-THROUGH (ft) — applies ONLY after an error: a wrong value from an earlier part, used correctly in a
later part, still earns the later marks. Normally visible working is required, EXCEPT when every mark of the
part is an answer/implied mark — then the correct answer computed on the wrong value is enough. WITHIN the
same part, after the error there are no more A marks for work that uses the error, but M marks still apply.
An error that greatly simplifies the question -> fewer ft marks (examiner judgement). An impossible value
(probability > 1, sin θ = 1.5, a non-integer where an integer is required) -> no final-answer mark.
Contradicting given data, or a failed "show that" followed by using the student's own value instead of the
given one -> no ft. The word "their" in the scheme signals that ft is expected. An error in one part but a
correct answer in the next -> award, UNLESS the command term is a strict "Hence" (no "or otherwise").

FURTHER WORKING (FUW): once the correct answer is seen, later incorrect working is ignored — EXCEPT when the
later incorrect value feeds a subsequent part: then retain the part's final A1 and follow through onward.

MIS-READ (MR): the student copies a value from the question stem wrongly -> penalise ONCE (withhold the
first mark of the part, award the rest on the value the student read). Mis-copying the student's OWN earlier
work is an error, not MR. With no visible working you cannot infer MR.

ANSWER GIVEN (AG): where the answer is printed in the question, the answer alone is worth zero — marks
depend on the full development. In a "show that" the student need not rewrite the AG line unless a Note says so.

ALTERNATIVE METHODS: follow the path the student actually took (METHOD 1 / METHOD 2, EITHER…OR). A strict
"Hence" accepts only the requested method.

EQUIVALENT FORMS: accept international notation (1,9 = 1.9; 1 000 = 1,000). Calculator notation is acceptable
for intermediate M/A marks but NOT for the final answer.

ACCURACY: unless the question specifies otherwise, the final answer must be exact or correct to 3 s.f. OR
MORE precise — the scheme prints the unrounded value in parentheses (e.g. 4150 (4145.81…)) and both, plus
any consistent more-precise value, earn the mark. LOSE the mark for: fewer than 3 s.f., incorrect rounding,
or ignoring an accuracy explicitly required by the question (a mark is tied to it). Intermediate A marks need
no simplification; final answers must complete the arithmetic (√(25/4) -> 5/2; a fraction need not be in
lowest terms — 10/4 is fine, but 10/5 must become 2).

MULTIPLE SOLUTIONS: mark only the FIRST answer to a question, unless the student indicates which to mark.

CROSSED-OUT WORK: any step marked [scratch] or shown as crossed out / struck through in the transcript earns
NO marks, even if correct — the student rejected it.

CORRECT-ANSWER MARKS (C1 / C2 / C3, or a mark whose descriptor is "correct answer only" / "answer only"):
these are an ALTERNATIVE to that sub-part's method and accuracy marks — awarded when the final answer is
correct but no working is shown — NEVER in addition to them. For a sub-part, award EITHER the method/accuracy
breakdown (when working is shown) OR the correct-answer mark (when only the right answer appears), whichever
credits the student more; do not award both. A sub-part can never score more than its stated [N marks] maximum.

NEVER GUESS. If the rules and Notes do not resolve an ambiguity, do NOT award — set the mark false and add a
textual flag explaining the ambiguity so the teacher decides.`;

// ---------------------------------------------------------------------------
// Injectable JSON runner — defaults to the real CLI-backed runClaudeJson, but
// scripts/dp-synthetic-check.ts injects its own DB-free CLI runner so the
// synthetic harness never touches data/app.db.
// ---------------------------------------------------------------------------

export type DpJsonRunner = <T>(opts: RunClaudeOptions) => Promise<T>;

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

/**
 * Renders one question's transcript for the grader, folding in the teacher's
 * illegible-flag resolutions (identical semantics to lib/pipeline/grade.ts):
 *   - resolvedText non-empty -> use the corrected text.
 *   - resolvedText === ""     -> ungradeable segment, earns NO credit.
 */
function renderResolvedTranscript(tq: TranscriptQuestion): string {
  if (tq.blank || tq.steps.length === 0) {
    return "(BLANK — the student showed no work for this question.)";
  }
  const flagByStep = new Map<number, { note: string; resolvedText?: string }>();
  for (const f of tq.illegible) flagByStep.set(f.stepIndex, f);

  // Lines the teacher has taken out of the answer are dropped here, and the
  // rest renumbered, so the model never sees working she has already said does
  // not count — and never sees a gap where it was.
  return tq.steps
    .map((step, idx) => ({ step, idx }))
    .filter(({ step }) => !step.omitted)
    .map(({ step, idx }, position) => {
      const n = position + 1;
      const flag = flagByStep.get(idx);
      if (flag) {
        if (flag.resolvedText && flag.resolvedText.trim() !== "") {
          return `  ${n}. ${flag.resolvedText}   [teacher-corrected illegible segment]`;
        }
        return `  ${n}. ${step.text}   [UNGRADEABLE illegible segment — earns no credit: ${flag.note}]`;
      }
      const conf = step.confident ? "" : "   [low confidence]";
      return `  ${n}. ${step.text}${conf}`;
    })
    .join("\n");
}

/** Renders the verbatim markscheme for a question so the grader marks against the official notation. */
function renderScheme(scheme: DpQuestionScheme): string {
  const parts = scheme.subparts.map((sp) => renderSubpart(sp));
  return `MARK SCHEME (total ${scheme.totalMarks} marks):\n${parts.join("\n\n")}`;
}

function renderSubpart(sp: DpSubpart): string {
  const header = sp.label ? `Part (${sp.label})` : "Question";
  const marks = sp.marks
    .map((m) => {
      const bits = [
        `id="${m.id}"`,
        `code=${m.code}`,
        `worth ${m.value}`,
        m.implied ? "IMPLIED" : null,
        m.ft ? "ft" : null,
        m.alt ? `altGroup=${m.alt}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      return `    - [${bits}] ${m.descriptor}`;
    })
    .join("\n");
  const notes =
    sp.notes.length > 0
      ? `\n  BINDING NOTES (override the general rules for this part):\n${sp.notes
          .map((n) => `    * ${n}`)
          .join("\n")}`
      : "";
  return `${header} [${sp.maxMarks} marks]
  Scheme text: ${sp.scheme}
  Marks to award:
${marks}${notes}`;
}

// ---------------------------------------------------------------------------
// Model I/O contracts
// ---------------------------------------------------------------------------

type Pass1Award = { markId: string; awarded: boolean; evidence: string };
type Pass1Subpart = { label: string; awards: Pass1Award[]; flags?: string[] };
type Pass2Award = { markId: string; conservativeAwarded: boolean; argument?: string };
type Pass2Subpart = { label: string; awards: Pass2Award[] };

// ---------------------------------------------------------------------------
// Pure per-question judging — testable via scripts/dp-synthetic-check.ts
// ---------------------------------------------------------------------------

export type GradeDpQuestionOptions = {
  questionNumber?: string;
  pseudonym?: string;
  forbiddenNames?: string[];
  runJson?: DpJsonRunner;
};

/**
 * Judges ONE question's transcript against its DpQuestionScheme under `rules`,
 * running two CLI passes (evidence-anchored pass 1, then a skeptical
 * conservative pass 2 that may only DOWNGRADE). Returns a DpGradingQuestion.
 *
 * Pure with respect to the database — it never reads or writes app.db; all data
 * arrives as arguments and the model runner is injectable. A BLANK transcript is
 * short-circuited to zero credit without a CLI call.
 */
export async function gradeDpQuestion(
  transcript: TranscriptQuestion,
  scheme: DpQuestionScheme,
  rules: string,
  options: GradeDpQuestionOptions = {}
): Promise<DpGradingQuestion> {
  const {
    questionNumber = transcript.questionNumber || "?",
    pseudonym = "the student",
    forbiddenNames = [],
    runJson = runClaudeJson as DpJsonRunner,
  } = options;

  // BLANK -> no credit, no CLI call (spec: blank = no marks).
  if (transcript.blank || transcript.steps.length === 0) {
    const subparts: DpGradingSubpart[] = scheme.subparts.map((sp) => ({
      label: sp.label,
      awards: sp.marks.map((m) => zeroAward(m, "BLANK — the student showed no work for this question.")),
      flags: [],
    }));
    return { subparts, totalAwarded: 0 };
  }

  const transcriptText = renderResolvedTranscript(transcript);
  const schemeText = renderScheme(scheme);

  // ---- PASS 1 — evidence-anchored marking ----
  const pass1 = await runJson<Pass1Subpart[]>({
    purpose: "grade-dp-pass1",
    forbiddenNames,
    prompt: buildPass1Prompt({ questionNumber, pseudonym, transcriptText, schemeText, rules }),
  });
  const pass1ByLabel = indexSubparts(pass1);

  // ---- PASS 2 — skeptical second marker, may only LOWER ----
  const pass2 = await runJson<Pass2Subpart[]>({
    purpose: "grade-dp-pass2",
    forbiddenNames,
    prompt: buildPass2Prompt({
      questionNumber,
      pseudonym,
      transcriptText,
      schemeText,
      rules,
      pass1,
    }),
  });
  const pass2ByLabel = indexSubparts(pass2);

  // ---- Merge into DpGradingQuestion ----
  const subparts: DpGradingSubpart[] = [];
  let totalAwarded = 0;

  for (const sp of scheme.subparts) {
    const p1 = pass1ByLabel.get(sp.label);
    const p2 = pass2ByLabel.get(sp.label);
    const p1AwardById = new Map((p1?.awards ?? []).map((a) => [a.markId, a] as const));
    const p2AwardById = new Map((p2?.awards ?? []).map((a) => [a.markId, a] as const));

    let spAwarded = 0;
    const awards: DpMarkAward[] = sp.marks.map((m) => {
      const a1 = p1AwardById.get(m.id);
      const awarded = Boolean(a1?.awarded);
      const rawEvidence = a1?.evidence ?? "No judgment returned for this mark.";
      const evidence = scrubOutput(rawEvidence, forbiddenNames).text;

      // Conservative pass can only DOWNGRADE. If pass 1 already said false it
      // stays false; if pass 2 is missing, mirror pass 1.
      const a2 = p2AwardById.get(m.id);
      const conservativeAwarded = awarded && a2 ? a2.conservativeAwarded !== false : awarded;
      const lowered = awarded && !conservativeAwarded;
      const note =
        lowered && a2?.argument ? scrubOutput(a2.argument, forbiddenNames).text || undefined : undefined;

      if (awarded) spAwarded += m.value;
      return {
        markId: m.id,
        code: m.code,
        awarded,
        conservativeAwarded,
        evidence,
        ...(note ? { note } : {}),
      };
    });
    // Never award a sub-part more than its stated max — a correct-answer mark (C1/C2/C3)
    // is an ALTERNATIVE to that sub-part's method/accuracy marks, not an addition, so a
    // scheme carrying both must still cap at maxMarks.
    totalAwarded += Math.min(spAwarded, sp.maxMarks);

    const flags = [...(p1?.flags ?? [])]
      .filter((f) => typeof f === "string" && f.trim() !== "")
      .map((f) => scrubOutput(f, forbiddenNames).text);
    // A mark the model never judged is itself an ambiguity worth surfacing.
    for (const m of sp.marks) {
      if (!p1AwardById.has(m.id)) {
        flags.push(`No judgment returned for mark ${m.id} (${m.code}) — review manually.`);
      }
    }

    subparts.push({ label: sp.label, awards, flags });
  }

  return { subparts, totalAwarded };
}

function zeroAward(m: DpSchemeMark, evidence: string): DpMarkAward {
  return {
    markId: m.id,
    code: m.code,
    awarded: false,
    conservativeAwarded: false,
    evidence,
  };
}

function indexSubparts<T extends { label: string }>(subs: T[]): Map<string, T> {
  const map = new Map<string, T>();
  if (Array.isArray(subs)) {
    for (const s of subs) {
      if (s && typeof s.label === "string") map.set(s.label.trim(), s);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildPass1Prompt(args: {
  questionNumber: string;
  pseudonym: string;
  transcriptText: string;
  schemeText: string;
  rules: string;
}): string {
  const { questionNumber, pseudonym, transcriptText, schemeText, rules } = args;
  return `You are an IB DP Mathematics examiner marking question ${questionNumber} for student ${pseudonym}.
Mark STRICTLY, mark by mark, against the official mark scheme below, applying the marking rules literally.
You are marking blind: judge ONLY the transcribed student work; do not solve the problem yourself and do not
assume marks for a correct-looking answer without inspecting the working.

${rules}

${schemeText}

STUDENT WORK (transcribed; steps are numbered; "[scratch]" / crossed-out steps earn nothing;
"[UNGRADEABLE illegible segment]" earns nothing for that segment):
${transcriptText}

For EVERY mark listed in the scheme decide award true/false and cite the exact student step number that
justifies it (or state why it is denied). Binding Notes override the general rules. Multiple A marks on one
line are independent. Never award an A after M0 on the same method unless a Note allows it. If an ambiguity
is unresolved by the rules and Notes, set award=false and add a "flags" entry explaining it — never guess.

Return ONLY strict JSON: an array with one object per sub-part, each exactly:
{ "label": "<the sub-part label exactly as given, e.g. \\"a\\" or \\"b.i\\" or \\"\\" if none>",
  "awards": [ { "markId": "<the scheme mark id>", "awarded": <true|false>, "evidence": "<cite the step number>" } ],
  "flags": [ "<ambiguity needing the teacher's decision>" ] }
No prose, no code fences.`;
}

function buildPass2Prompt(args: {
  questionNumber: string;
  pseudonym: string;
  transcriptText: string;
  schemeText: string;
  rules: string;
  pass1: Pass1Subpart[];
}): string {
  const { questionNumber, pseudonym, transcriptText, schemeText, rules, pass1 } = args;
  return `You are a SKEPTICAL SECOND EXAMINER re-checking a first examiner's marking of IB DP Mathematics
question ${questionNumber} for student ${pseudonym}. Your ONLY job is to find marks the first examiner awarded
too generously and set them to false. You may NEVER raise a mark: if a mark was false it stays false; if the
evidence fully supports an awarded mark, keep conservativeAwarded=true and leave argument empty.

Be suspicious of: A marks awarded after an M0 on the same method, marks awarded without visible justification,
answer marks for values below 3 s.f. / wrongly rounded / in calculator notation, credit for crossed-out or
illegible work, and follow-through applied where the rules forbid it. Cite the student step in your argument
whenever you lower a mark.

${rules}

${schemeText}

STUDENT WORK (transcribed):
${transcriptText}

FIRST-PASS MARKING TO SCRUTINISE:
${JSON.stringify(pass1, null, 2)}

Return ONLY strict JSON: an array with one object per sub-part, each exactly:
{ "label": "<sub-part label exactly as given>",
  "awards": [ { "markId": "<scheme mark id>", "conservativeAwarded": <true|false>, "argument": "<why you lowered it, citing the step; empty string if unchanged>" } ] }
No prose, no code fences.`;
}

// ---------------------------------------------------------------------------
// Per-submission pipeline
// ---------------------------------------------------------------------------

export type GradeDpResult = {
  submissionId: number;
  gradedQuestions: number;
  totalMarks: number;
  conservativeMarks: number;
  maxMarks: number;
  pct: number;
  grade: number;
};

/** Reads the per-paper examiner instructions if the teacher supplied them. */
function loadExaminerInstructions(assessmentId: number): string | null {
  const file = path.join(process.cwd(), "data", "dp", String(assessmentId), "examiner-instructions.txt");
  try {
    if (fs.existsSync(file)) {
      const text = fs.readFileSync(file, "utf-8").trim();
      return text.length > 0 ? text : null;
    }
  } catch {
    /* fall through to null — the default rules still apply */
  }
  return null;
}

/** Grades one DP submission mark-by-mark and persists gradings + dp_result. */
export async function gradeDpSubmission(submissionId: number): Promise<GradeDpResult> {
  const submission = getSubmission(submissionId);
  if (!submission) throw new Error(`grade-dp: submission ${submissionId} not found`);
  if (submission.status === "absent") throw new Error(`grade-dp: submission ${submissionId} is absent`);
  if (submission.student_id == null) {
    throw new Error(`grade-dp: submission ${submissionId} has no student assigned`);
  }
  const student = getStudent(submission.student_id);
  if (!student) throw new Error(`grade-dp: student ${submission.student_id} not found`);

  const assessment = getAssessment(submission.assessment_id);
  if (!assessment) throw new Error(`grade-dp: assessment ${submission.assessment_id} not found`);
  if (assessment.programme !== "DP") {
    throw new Error(`grade-dp: assessment ${assessment.id} is not a DP assessment`);
  }

  const questions = listQuestions(assessment.id);
  const questionById = new Map(questions.map((q) => [q.id, q] as const));
  const transcripts = listTranscripts(submission.id);
  if (transcripts.length === 0) {
    throw new Error(`grade-dp: submission ${submissionId} has no transcripts — transcribe first`);
  }

  // ---- Precondition: every illegible flag resolved or explicitly ungradeable ----
  const unresolved: { questionNumber: string; stepIndex: number; note: string }[] = [];
  for (const t of transcripts) {
    for (const f of t.content.illegible) {
      if (f.resolvedText === undefined) {
        unresolved.push({
          questionNumber: t.content.questionNumber,
          stepIndex: f.stepIndex,
          note: f.note,
        });
      }
    }
  }
  if (unresolved.length > 0) throw new UnresolvedFlagsError(unresolved);

  const forbiddenNames = getForbiddenNames(student.class_id);
  const examiner = loadExaminerInstructions(assessment.id);
  const markingNotes = getApplicableMarkingInstructions(assessment.id)
    .map((m) => `- ${m.text}`)
    .join("\n");
  const rules = [
    DEFAULT_DP_RULES,
    examiner ? `PAPER-SPECIFIC INSTRUCTIONS TO EXAMINERS (these take precedence):\n${examiner}` : null,
    markingNotes
      ? `TEACHER'S MARKING NOTES (apply these; they override the defaults where they conflict):\n${markingNotes}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const items = transcripts
    .map((t) => ({ q: questionById.get(t.question_id), tq: t.content }))
    .filter((x): x is { q: QuestionRow; tq: TranscriptQuestion } => x.q !== undefined)
    .sort((a, b) => a.q.id - b.q.id);

  let totalMarks = 0;
  let conservativeMarks = 0;
  let maxMarks = 0;
  let graded = 0;

  // Questions are marked in parallel (each is independent: pass1+pass2 against its
  // own mark scheme). This only changes WHEN calls run, never WHAT they do, so grades
  // are identical to sequential marking — just ~4x faster on the wall clock.
  const gradable = items.filter((it) => it.q.dp_scheme);
  const QUESTION_CONCURRENCY = 4;
  const pseudonym = student.pseudonym;
  let cursor = 0;
  async function worker() {
    while (true) {
      const item = gradable[cursor++];
      if (!item) return;
      const { q, tq } = item;
      const scheme = q.dp_scheme!;
      const grading = await gradeDpQuestion(tq, scheme, rules, {
        questionNumber: q.number,
        pseudonym,
        forbiddenNames,
        runJson: runClaudeJson as DpJsonRunner,
      });
      // These run synchronously between awaits (JS is single-threaded), so the
      // accumulators and the SQLite writes never actually overlap.
      upsertGrading({
        submission_id: submissionId,
        question_id: q.id,
        content: grading as unknown as GradingQuestion,
      });
      totalMarks += grading.totalAwarded;
      conservativeMarks += conservativeTotal(grading, scheme);
      maxMarks += scheme.totalMarks;
      graded++;
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(QUESTION_CONCURRENCY, gradable.length) }, () => worker())
  );

  // The stored result is computed from the decided marks — the conservative
  // pass until the teacher changes one — exactly as the review screen
  // recomputes it, so the gradebook and the ticked marks agree from the start.
  const { pct, grade } = recomputeAndPersistDpResult(assessment.id, submission.id);

  updateSubmission(submission.id, { status: "graded" });

  return {
    submissionId: submission.id,
    gradedQuestions: graded,
    totalMarks,
    conservativeMarks,
    maxMarks,
    pct,
    grade,
  };
}

/** Sum of mark values whose conservative (skeptical) judgment kept them awarded. */
function conservativeTotal(grading: DpGradingQuestion, scheme: DpQuestionScheme): number {
  const maxByLabel = new Map((scheme.subparts ?? []).map((sp) => [sp.label, sp.maxMarks]));
  let sum = 0;
  for (const sp of grading.subparts) {
    let spSum = 0;
    for (const a of sp.awards) {
      if (a.conservativeAwarded) spSum += markValue(a);
    }
    const cap = maxByLabel.get(sp.label);
    sum += cap != null ? Math.min(spSum, cap) : spSum;
  }
  return sum;
}

/** A2/A3 carry >1 mark; recover the value from the code when we only hold the award. */
function markValue(a: DpMarkAward): number {
  const m = a.code.match(/(\d+)/);
  return m ? Number(m[1]) : 1;
}
