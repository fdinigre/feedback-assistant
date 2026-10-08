import "server-only";

import {
  getAssessment,
  getClass,
  getDpResult,
  getLearningTarget,
  getStudent,
  getSubmission,
  listAssessments,
  listExternalData,
  listGradings,
  listQuestions,
  listStyleExamples,
  listSubmissions,
  upsertReport,
} from "@/lib/db/queries";
import { NO_COMMENT_EXAMPLES } from "@/lib/style/examples";
import type {
  AssessmentRow,
  DpGradingQuestion,
  DpQuestionScheme,
  DpResultRow,
  GradeBoundary,
  QuestionRow,
  ReportSections,
} from "@/lib/types";
import { getForbiddenNames, scrubOutput } from "@/lib/pipeline/guards";
import { atlCommentRule, atlFocusJsonShape, parseAtlFocus } from "@/lib/atl/report-focus";
import { runClaudeJson } from "@/lib/pipeline/run";
import { pickFinal, sumQuestionMarks } from "@/lib/submissions/dp-calc";
import { recomputeAndPersistDpResult } from "@/lib/submissions/dp-grading";

export type DpReportResult = { submissionId: number; hasDataCorrelation: boolean };

// Same fixed interpretation guide used by the MYP report generator
// (lib/pipeline/report.ts) — copied verbatim so DP reports explain MAP/CAT4
// numbers the same way, when they exist.
const EXTERNAL_DATA_INTERPRETATION_GUIDE = `HOW TO READ THE EXTERNAL DATA:
MAP (NWEA):
- "Overall RIT" = scale score on the RIT scale (typically ~200-260 in middle/high school; higher = higher attainment).
- "Achievement Percentile" = national percentile rank (1-99).
- "Percentile Band": Lo (<21), LoAvg (21-40), Avg (41-60), HiAvg (61-80), High (>80).
- "Met Growth" = whether the student met their projected growth target between test windows (No = growing slower
  than projection even if attainment is high).
- Strand columns (Operations and Algebraic Thinking, Number Systems, Geometry, Statistics and Probability) are
  DELTAS: strand RIT minus Overall RIT — positive = relative strength, negative = relative weakness within the
  student's own profile; |delta| >= 5 is worth commenting, smaller is noise.

CAT4 (GL):
- SAS = Standardised Age Score, normed mean 100, SD 15 (59-141 range). >=112 above average; 89-111 average;
  <=88 below average.
- Batteries: Verbal, Non-verbal, Quantitative, Spatial; Mean SAS = overall.
- For mathematics, Quantitative and Spatial are the most predictive.
- A large gap between CAT4 (potential) and MAP/test performance (attainment) is exactly the kind of insight to
  surface (e.g. high SAS + low test score = underperformance vs potential, not lack of ability).

Interpret using these definitions, compare potential (CAT4) vs attainment (MAP + this assessment), and never
over-read small deltas.`;

type TargetTotal = { name: string; obtained: number; possible: number };
type TargetTotals = Map<number, TargetTotal>;

type DpHistoryEntry = {
  assessment: AssessmentRow;
  dpResult: DpResultRow;
  targetTotals: TargetTotals;
};

/** "quiz" -> "formative quiz", "unit_test" -> "summative unit test". */
function assessmentTypeLabel(type: string | null): string {
  if (type === "quiz") return "formative quiz";
  if (type === "unit_test") return "summative unit test";
  return "assessment";
}

function buildSchemeValueIndex(scheme: DpQuestionScheme | null): Map<string, number> {
  const index = new Map<string, number>();
  if (!scheme) return index;
  for (const subpart of scheme.subparts) {
    for (const mark of subpart.marks) {
      index.set(mark.id, mark.value);
    }
  }
  return index;
}

function formatBoundaries(boundaries: GradeBoundary[] | null): string {
  if (!boundaries || boundaries.length === 0) return "(no grade boundaries on file)";
  return [...boundaries]
    .sort((a, b) => a.minPct - b.minPct)
    .map((b) => `Grade ${b.grade}: >= ${b.minPct}%`)
    .join("\n");
}

function formatPct(pct: number): string {
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
}

/**
 * Builds the mark-by-mark evidence block for one submission's gradings, and
 * accumulates obtained/possible marks per learning target as a side effect.
 * Grading content is stored generically as JSON in the `gradings` table; for
 * DP submissions the shape is DpGradingQuestion (subparts of mark awards),
 * not the MYP GradingQuestion shape that lib/db/queries.ts types it as.
 */
function buildQuestionBreakdown(
  gradings: { question_id: number; content: unknown }[],
  questionById: Map<number, QuestionRow>
): { block: string; targetTotals: TargetTotals } {
  const targetTotals: TargetTotals = new Map();
  const lines: string[] = [];

  for (const g of gradings) {
    const q = questionById.get(g.question_id);
    if (!q) continue;
    const content = g.content as DpGradingQuestion;
    const valueIndex = buildSchemeValueIndex(q.dp_scheme);
    const lt = q.learning_target_id ? getLearningTarget(q.learning_target_id) : undefined;

    // The decided marks, as the review screen shows them: the teacher's choice
    // where there is one, the conservative pass otherwise. Never the first
    // pass alone, which the conservative pass may have lowered.
    const obtained = sumQuestionMarks(content, q.dp_scheme, pickFinal);
    lines.push(
      `Q${q.number}${lt ? ` [target: ${lt.name}]` : ""} — ${obtained}/${q.max_points} marks:`
    );
    for (const sp of content.subparts ?? []) {
      const label = sp.label ? `(${sp.label}) ` : "";
      const flagStr = sp.flags && sp.flags.length > 0 ? ` [FLAGS: ${sp.flags.join("; ")}]` : "";
      if (label || flagStr) lines.push(`  ${label}${flagStr}`.trimEnd());
      for (const award of sp.awards ?? []) {
        const effective = pickFinal(award);
        const value = valueIndex.get(award.markId) ?? 1;
        const status = effective ? `AWARDED ${value}` : "NOT AWARDED";
        const note = award.note ? ` (note: ${award.note})` : "";
        lines.push(`    - ${award.code} [${status}]: ${award.evidence}${note}`);
      }
    }

    if (q.learning_target_id != null) {
      const key = q.learning_target_id;
      const prev = targetTotals.get(key) ?? { name: lt?.name ?? `target#${key}`, obtained: 0, possible: 0 };
      prev.obtained += obtained;
      prev.possible += q.max_points;
      targetTotals.set(key, prev);
    }
  }

  return { block: lines.join("\n"), targetTotals };
}

function formatTargetTotals(totals: TargetTotals): string {
  if (totals.size === 0) return "(no learning targets mapped)";
  return [...totals.values()]
    .map((t) => {
      const pct = t.possible > 0 ? Math.round((t.obtained / t.possible) * 1000) / 10 : 0;
      return `- ${t.name}: ${t.obtained}/${t.possible} (${formatPct(pct)}%)`;
    })
    .join("\n");
}

/**
 * Every prior DP assessment (any programme='DP' assessment other than the
 * current one) this student has a graded submission for, oldest first.
 * "Graded" = has a dp_results row; ungraded/in-progress submissions are
 * skipped rather than counted as zero.
 */
function collectDpHistory(studentId: number, excludeAssessmentId: number): DpHistoryEntry[] {
  const dpAssessments = listAssessments().filter(
    (a) => a.programme === "DP" && a.id !== excludeAssessmentId
  );
  const entries: DpHistoryEntry[] = [];

  for (const assessment of dpAssessments) {
    const submissions = listSubmissions(assessment.id).filter((s) => s.student_id === studentId);
    for (const submission of submissions) {
      const dpResult = getDpResult(submission.id);
      if (!dpResult) continue; // not graded yet — do not count
      const gradings = listGradings(submission.id);
      if (gradings.length === 0) continue;
      const questions = listQuestions(assessment.id);
      const questionById = new Map(questions.map((q) => [q.id, q] as const));
      const { targetTotals } = buildQuestionBreakdown(gradings, questionById);
      entries.push({ assessment, dpResult, targetTotals });
    }
  }

  entries.sort((a, b) => a.assessment.created_at.localeCompare(b.assessment.created_at));
  return entries;
}

function aggregateHistoryTargets(history: DpHistoryEntry[]): TargetTotals {
  const merged: TargetTotals = new Map();
  for (const entry of history) {
    for (const [key, t] of entry.targetTotals) {
      const prev = merged.get(key) ?? { name: t.name, obtained: 0, possible: 0 };
      prev.obtained += t.obtained;
      prev.possible += t.possible;
      merged.set(key, prev);
    }
  }
  return merged;
}

function formatHistorySummary(history: DpHistoryEntry[]): string {
  if (history.length === 0) return "(none — this is the student's first graded DP assessment in the app)";
  return history
    .map((entry) => {
      const { assessment, dpResult } = entry;
      const grade = dpResult.grade_final ?? dpResult.grade;
      return `- "${assessment.title}" (${assessmentTypeLabel(assessment.assessment_type)}${
        assessment.date ? `, ${assessment.date}` : ""
      }): ${dpResult.total_marks}/${dpResult.max_marks} = ${formatPct(dpResult.pct)}% -> Grade ${grade}`;
    })
    .join("\n");
}

export async function generateDpReport(submissionId: number): Promise<DpReportResult> {
  const submission = getSubmission(submissionId);
  if (!submission) throw new Error(`report-dp: submission ${submissionId} not found`);
  if (submission.student_id == null) {
    throw new Error(`report-dp: submission ${submissionId} has no student assigned`);
  }
  const student = getStudent(submission.student_id);
  if (!student) throw new Error(`report-dp: student ${submission.student_id} not found`);

  const assessment = getAssessment(submission.assessment_id);
  if (!assessment) throw new Error(`report-dp: assessment ${submission.assessment_id} not found`);
  if (assessment.programme !== "DP") {
    throw new Error(`report-dp: assessment ${assessment.id} is not a DP assessment`);
  }

  // Precondition (spec): dp_results must exist — grading (incl. review) runs first.
  if (!getDpResult(submission.id)) {
    throw new Error(`report-dp: submission ${submissionId} has no dp_results — grade first`);
  }
  // Brought up to date from the decided marks before the report quotes it, so
  // the total and grade it states are the ones on the review screen.
  const dpResult = recomputeAndPersistDpResult(assessment.id, submission.id);

  const questions = listQuestions(assessment.id);
  const questionById = new Map(questions.map((q) => [q.id, q] as const));
  const gradings = listGradings(submission.id);
  if (gradings.length === 0) {
    throw new Error(`report-dp: submission ${submissionId} has no gradings — grade first`);
  }

  const forbiddenNames = getForbiddenNames(student.class_id);
  const cls = getClass(student.class_id);

  // --- this assessment: mark-by-mark evidence + learning-target totals ---
  const { block: perQuestionBlock, targetTotals: currentTargetTotals } = buildQuestionBreakdown(
    gradings,
    questionById
  );
  const currentTargetBlock = formatTargetTotals(currentTargetTotals);

  // --- this student's prior DP assessments in the app ---
  const history = collectDpHistory(student.id, assessment.id);
  const hasHistory = history.length > 0;
  const historySummaryBlock = formatHistorySummary(history);
  const historyTargetTotals = aggregateHistoryTargets(history);
  const historyTargetBlock = hasHistory
    ? formatTargetTotals(historyTargetTotals)
    : "(no prior DP assessments to compare against)";

  // --- external data: PRIOR_GRADES (Year 1) always considered; MAP/CAT4 only if present ---
  const externalRows = listExternalData(student.id);
  const correlationRows = externalRows.filter((r) => r.source === "MAP" || r.source === "CAT4");
  const hasExternalData = correlationRows.length > 0;
  const externalBlock = hasExternalData
    ? correlationRows.map((r) => `${r.source}: ${JSON.stringify(r.data)}`).join("\n")
    : "(none on file)";

  const priorGradesRows = externalRows.filter((r) => r.source === "PRIOR_GRADES");
  const hasPriorGrades = priorGradesRows.length > 0;
  const priorGradesBlock = hasPriorGrades
    ? priorGradesRows
        .map((r) => `${r.source}${r.period ? ` (${r.period})` : ""}: ${JSON.stringify(r.data)}`)
        .join("\n")
    : "(none on file)";

  const hasAnyCorrelationData = hasPriorGrades || hasHistory || hasExternalData;

  const styleComments = listStyleExamples("comment")
    .slice(0, 2)
    .map((s, i) => `Example ${i + 1}:\n${s.content}`)
    .join("\n\n") || NO_COMMENT_EXAMPLES;
  const structure = listStyleExamples("report")[0]?.content ?? "";

  const grade = dpResult.grade_final ?? dpResult.grade;

  const prompt = buildDpReportPrompt({
    pseudonym: student.pseudonym,
    assessmentTitle: assessment.title,
    assessmentTypeLabel: assessmentTypeLabel(assessment.assessment_type),
    className: cls?.name ?? null,
    totalMarks: dpResult.total_marks,
    maxMarks: dpResult.max_marks,
    pct: dpResult.pct,
    grade,
    boundariesBlock: formatBoundaries(assessment.boundaries),
    perQuestionBlock,
    currentTargetBlock,
    hasHistory,
    historySummaryBlock,
    historyTargetBlock,
    hasPriorGrades,
    priorGradesBlock,
    hasExternalData,
    externalBlock,
    hasAnyCorrelationData,
    styleComments,
    structure,
  });

  const parsed = await runClaudeJson<ReportSections>({
    purpose: "report-dp",
    prompt,
    forbiddenNames,
  });

  const sections: ReportSections = {
    dataCorrelation: hasAnyCorrelationData
      ? scrubText(parsed.dataCorrelation ?? null, forbiddenNames)
      : null, // omit if no Year 1 grades, no DP history and no MAP/CAT4 — never invented
    strengths: scrubArray(parsed.strengths, forbiddenNames),
    areasForImprovement: scrubArray(parsed.areasForImprovement, forbiddenNames),
    actionableSteps: scrubArray(parsed.actionableSteps, forbiddenNames),
    feedbackComment: scrubOutput(String(parsed.feedbackComment ?? ""), forbiddenNames).text,
    toddleReport: scrubOutput(String(parsed.toddleReport ?? ""), forbiddenNames).text,
    atlFocus: parseAtlFocus(parsed.atlFocus, forbiddenNames),
  };

  upsertReport({ submission_id: submission.id, sections, status: "draft" });
  return { submissionId: submission.id, hasDataCorrelation: hasAnyCorrelationData };
}

function scrubText(value: string | null, forbidden: string[]): string | null {
  if (value == null) return null;
  return scrubOutput(String(value), forbidden).text;
}
function scrubArray(value: unknown, forbidden: string[]): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => scrubOutput(String(v), forbidden).text);
}

function buildDpReportPrompt(args: {
  pseudonym: string;
  assessmentTitle: string;
  assessmentTypeLabel: string;
  className: string | null;
  totalMarks: number;
  maxMarks: number;
  pct: number;
  grade: number;
  boundariesBlock: string;
  perQuestionBlock: string;
  currentTargetBlock: string;
  hasHistory: boolean;
  historySummaryBlock: string;
  historyTargetBlock: string;
  hasPriorGrades: boolean;
  priorGradesBlock: string;
  hasExternalData: boolean;
  externalBlock: string;
  hasAnyCorrelationData: boolean;
  styleComments: string;
  structure: string;
}): string {
  const {
    pseudonym,
    assessmentTitle,
    assessmentTypeLabel: typeLabel,
    className,
    totalMarks,
    maxMarks,
    pct,
    grade,
    boundariesBlock,
    perQuestionBlock,
    currentTargetBlock,
    hasHistory,
    historySummaryBlock,
    historyTargetBlock,
    hasPriorGrades,
    priorGradesBlock,
    hasExternalData,
    externalBlock,
    hasAnyCorrelationData,
    styleComments,
    structure,
  } = args;

  const correlationSources = [
    hasPriorGrades ? "the Year 1 prior grades" : null,
    hasHistory ? "the prior DP assessment history and learning-target trend" : null,
    hasExternalData ? "the MAP percentile/deltas and CAT4 SAS (using the interpretation guide)" : null,
  ].filter((s): s is string => s !== null);

  const dataCorrelationRule = hasAnyCorrelationData
    ? `cross-reference this assessment's grade and learning-target performance with ${correlationSources.join(
        ", "
      )}. Be specific and honest.${
        hasExternalData
          ? ""
          : " There is NO MAP or CAT4 data on file for this student — do NOT mention MAP, CAT4, RIT scores, SAS scores, percentiles, or any potential-vs-attainment analysis; base the correlation only on the sources listed above."
      }`
    : "there is NO prior-year grade, no prior DP assessment history, and NO MAP/CAT4 data on file for this student — return null for dataCorrelation. Do NOT invent any data or comparison.";

  return `Write a full analytical report for DP student ${pseudonym} on the ${typeLabel} "${assessmentTitle}"${
    className ? ` (${className})` : ""
  }.
Everything must be grounded in the graded evidence below. Do NOT invent facts, scores, or data.

CRITICAL — PRIVACY: Never write the student's real name. In the feedbackComment, address the student using the
literal token {{NAME}} (the tool re-injects the real name locally). Use "you" throughout the comment.

REPORT STRUCTURE TO FOLLOW:
${structure}

THIS ASSESSMENT — RESULT:
Total: ${totalMarks}/${maxMarks} marks = ${formatPct(pct)}% -> Grade ${grade} (IB 1-7 scale)
Grade boundaries used for this assessment:
${boundariesBlock}

THIS ASSESSMENT — MARK-BY-MARK EVIDENCE (IB notation: M=method, A=accuracy, R=reasoning, parentheses=implied mark, ft=follow-through):
${perQuestionBlock}

THIS ASSESSMENT — PERFORMANCE BY LEARNING TARGET:
${currentTargetBlock}

STUDENT'S PRIOR DP ASSESSMENT HISTORY IN THIS APP, oldest first (${
    hasHistory ? "for trend comparison" : "none yet"
  }):
${historySummaryBlock}

PRIOR DP HISTORY — PERFORMANCE BY LEARNING TARGET, aggregated across previous assessments (compare against THIS ASSESSMENT's target performance above to spot improvement or a persistent gap):
${historyTargetBlock}

PRIOR-YEAR GRADES (Year 1, source PRIOR_GRADES) for ${pseudonym}:
${priorGradesBlock}

EXTERNAL DATA (MAP percentile/strand deltas, CAT4 SAS) for ${pseudonym}:
${externalBlock}
${hasExternalData ? `\n${EXTERNAL_DATA_INTERPRETATION_GUIDE}\n` : ""}
WRITING RULES:
STYLE (applies to every section) — write for the STUDENT to read, in flowing prose, second person ("you"),
and keep it DIGESTIBLE:
  - Do NOT cite question numbers or labels (no "Q7", "Q12(c)", "part (b)"). Refer to the SKILL or topic by name
    (e.g. "the financial-maths question", "the normal-distribution work", "the χ² test").
  - Do NOT quote point tallies ("6/6", "2/18", "0/7") and do NOT dump raw input values (calculator entries,
    long decimals). Keep only the substance: what was done well or went wrong, and the named technique behind it.
  - CONSOLIDATE: group related observations into a few substantial sentences. Aim for at most 4-5 strengths and
    5-6 areas — the most important patterns, not one item per question. Short and clear beats exhaustive.
1. Data Correlation: ${dataCorrelationRule} Keep it to one tight paragraph; refer to skills by name, not by
   question number or per-question point tally.
2. Learning targets: name the specific skills/targets when discussing strengths and areas (this assessment and,
   when available, the trend vs. prior DP assessments) — but as skill names, never as question references.
3. Strengths: a few areas the student handled well, each naming the skill and the correct habit/technique they
   showed (e.g. deriving the target value before entering it, using the negative-reciprocal reasoning). Prose,
   no question numbers, no scores.
4. Areas for Improvement: name each specific error PATTERN and the skill it belongs to (e.g. adding along tree
   branches instead of multiplying, dividing by their own estimate in percentage error, leaving the long
   statistics questions blank). Be honest about blank/unattempted work and pacing — but describe it as a pattern,
   not a question-by-question list. Prose, no question numbers, no scores.
5. Actionable Steps: concrete, named techniques and drills (not generic advice), tied to the skills above. No
   question numbers.
6. Feedback Comment: a SINGLE paragraph of roughly 70-90 words addressing the student as {{NAME}} using "you".
   Structure: a specific strength with evidence -> the specific errors that limited the score -> one actionable next
   step tied to grade-band language (e.g. "to move from a grade 5 into a grade 6..."). Encouraging without inflating.
   TEACHER'S RULE — the comment must be SELF-CONTAINED: it must explicitly mention at least one strength and at
   least one concrete, directly actionable step drawn from your own Strengths / Actionable Steps sections above
   (a named technique the student can apply, not vague advice). A comment that identifies problems without telling
   the student what to DO about them is unacceptable.
${atlCommentRule()}
   Match the VOICE of these real teacher examples (do not copy their content, and use {{NAME}} instead of any name):
${styleComments}
6. Toddle Report (longer student-facing comment): a friendly, plain-language version the student reads on
   Toddle. Write it as ONE string with line breaks in EXACTLY this shape (keep the headings verbatim):
     A warm 1-2 sentence introduction addressed to {{NAME}} (use "you"), naming the assessment topic and the
     overall gist without any score.
     (blank line)
     What went well:
     - 2-4 short bullets drawn from Strengths, rewritten in easy student language (no jargon, no question
       numbers, no scores).
     (blank line)
     What to work on:
     - 2-4 short bullets drawn from Areas for Improvement, phrased kindly and concretely.
     (blank line)
     Your next steps:
     - 2-4 short bullets drawn from Actionable Steps, each a clear thing the student can actually do.
   Keep every bullet to one simple sentence a student would easily understand. Encouraging and specific.

Return ONLY strict JSON, exactly this shape:
{
  "dataCorrelation": <string or null>,
  "strengths": [ "<string>" ],
  "areasForImprovement": [ "<string>" ],
  "actionableSteps": [ "<string>" ],
  "feedbackComment": "<single paragraph, ~70-90 words, addresses {{NAME}}>",
  "toddleReport": "<multi-line student-facing comment in the shape described in rule 6>",
  ${atlFocusJsonShape()}
}
No prose, no code fences.`;
}
