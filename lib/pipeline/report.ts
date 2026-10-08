import "server-only";

import { isFmTest, questionsForStudent } from "@/lib/assessment/course";

import {
  getAssessment,
  getClass,
  getLearningTarget,
  getStudent,
  getSubmission,
  listCriterionLevels,
  listDescriptorChecks,
  listRubricDescriptors,
  listExternalData,
  listGradings,
  listQuestions,
  listStyleExamples,
  listTranscripts,
  upsertReport,
} from "@/lib/db/queries";
import type { DescriptorCheckRow, ReportSections, RubricDescriptorRow } from "@/lib/types";
import { LEVEL_BANDS } from "@/lib/assessment/bands";
import { suggestLevel } from "@/lib/assessment/descriptor-band";
import { getForbiddenNames, scrubOutput } from "@/lib/pipeline/guards";
import { atlCommentRule, atlFocusJsonShape, parseAtlFocus } from "@/lib/atl/report-focus";
import { runClaudeJson } from "@/lib/pipeline/run";
import { NO_COMMENT_EXAMPLES } from "@/lib/style/examples";

export type ReportResult = { submissionId: number; hasDataCorrelation: boolean };

// Fixed interpretation guide for MAP/CAT4 metrics, injected into the prompt
// whenever either source is present so the model reasons about what the
// numbers MEAN (potential vs. attainment) rather than just echoing them.
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

export async function generateReport(submissionId: number): Promise<ReportResult> {
  const submission = getSubmission(submissionId);
  if (!submission) throw new Error(`report: submission ${submissionId} not found`);
  if (submission.student_id == null) {
    throw new Error(`report: submission ${submissionId} has no student assigned`);
  }
  const student = getStudent(submission.student_id);
  if (!student) throw new Error(`report: student ${submission.student_id} not found`);

  const assessment = getAssessment(submission.assessment_id);
  if (!assessment) throw new Error(`report: assessment ${submission.assessment_id} not found`);

  const questions = questionsForStudent(listQuestions(assessment.id), student);
  const questionById = new Map(questions.map((q) => [q.id, q] as const));
  const gradings = listGradings(submission.id);
  if (gradings.length === 0) {
    throw new Error(`report: submission ${submissionId} has no gradings — grade first`);
  }
  const levels = listCriterionLevels(submission.id);
  const descriptors = listRubricDescriptors(assessment.id);
  const checkByDescriptorId = new Map(
    listDescriptorChecks(submission.id).map((c) => [c.descriptor_id, c])
  );
  const transcripts = listTranscripts(submission.id);
  const blankByQuestionId = new Map(transcripts.map((t) => [t.question_id, t.content.blank]));

  const externalRows = listExternalData(student.id);
  // Data Correlation is driven by MAP/CAT4 only — the warning on the roster
  // page ("Data Correlation will be skipped") is scoped to these two sources.
  const correlationRows = externalRows.filter((r) => r.source === "MAP" || r.source === "CAT4");
  const hasExternalData = correlationRows.length > 0;
  // Prior-year grades and ATL are separate reference/trajectory context, not
  // part of the correlation — surfaced in their own labelled block below.
  const referenceRows = externalRows.filter(
    (r) => r.source === "PRIOR_GRADES" || r.source === "ATL"
  );

  const forbiddenNames = getForbiddenNames(student.class_id);

  // Per-question evidence block, tagged with learning target and blank status.
  const perQuestion = gradings
    .map((g) => {
      const q = questionById.get(g.question_id);
      if (!q) return null;
      const lt = q.learning_target_id ? getLearningTarget(q.learning_target_id) : undefined;
      const blank = blankByQuestionId.get(g.question_id) ? " [BLANK — no work shown]" : "";
      // Default to the conservative pass when the teacher hasn't overridden: a
      // blind benchmark showed it matches her marking more often than the proposed pass.
      const pts = g.content.finalPoints ?? g.content.conservativePoints;
      return `- Q${q.number} (${pts}/${q.max_points})${lt ? ` [target: ${lt.name}]` : ""}${blank}: ${g.content.evidence}`;
    })
    .filter((x): x is string => x !== null)
    .join("\n");

  // A points-only test: the score out of the total stands in for criterion levels.
  const pointsOnly = isFmTest(assessment);
  const cls = assessment.class_id !== null ? getClass(assessment.class_id) : undefined;
  const total = gradings.reduce(
    (sum, g) => sum + (g.content.finalPoints ?? g.content.conservativePoints),
    0
  );
  const maxTotal = questions.reduce((sum, q) => sum + q.max_points, 0);

  // Criteria with descriptors are judged on command terms (describe / verify / justify),
  // so the feedback has to talk about those, not only about the mathematics.
  const hasDescriptors = descriptors.length > 0;

  const levelBlock = pointsOnly
    ? `Points-only formative test: ${total} out of ${maxTotal}. There are NO criterion levels for this test.`
    : levels
    .map((l) => {
      // The teacher's final level (when set) is the authoritative grade — lead with it.
      const finalNote =
        l.level_final != null
          ? `TEACHER-FINAL level ${l.level_final} (AI suggested ${l.level_proposed}, conservative ${l.level_conservative})`
          : `level ${l.level_conservative} (AI suggestion; proposed ${l.level_proposed}, conservative ${l.level_conservative} — no teacher override yet)`;
      return `- Criterion ${l.criterion}: ${finalNote}. Evidence: ${l.evidence}${renderDescriptorBreakdown(
        l.criterion,
        descriptors,
        checkByDescriptorId
      )}`;
    })
    .join("\n");

  const externalBlock = hasExternalData
    ? correlationRows.map((r) => `${r.source}: ${JSON.stringify(r.data)}`).join("\n")
    : "(none on file)";

  const referenceBlock =
    referenceRows.length > 0
      ? referenceRows
          .map((r) => `${r.source}${r.period ? ` (${r.period})` : ""}: ${JSON.stringify(r.data)}`)
          .join("\n")
      : "(none on file)";

  const styleComments = listStyleExamples("comment")
    .slice(0, 2)
    .map((s, i) => `Example ${i + 1}:\n${s.content}`)
    .join("\n\n") || NO_COMMENT_EXAMPLES;
  const structure = listStyleExamples("report")[0]?.content ?? "";

  const prompt = buildReportPrompt({
    pseudonym: student.pseudonym,
    assessmentTitle: assessment.title,
    perQuestion,
    levelBlock,
    externalBlock,
    hasExternalData,
    referenceBlock,
    styleComments,
    structure,
    pointsOnly,
    hasDescriptors,
    courseName: `Grade ${assessment.grade}${cls?.course ? ` ${cls.course}` : ""}`,
  });

  const parsed = await runClaudeJson<ReportSections>({
    purpose: "report",
    prompt,
    forbiddenNames,
  });

  const sections: ReportSections = {
    dataCorrelation: hasExternalData
      ? scrubText(parsed.dataCorrelation ?? null, forbiddenNames)
      : null, // omit if no external data — never invented
    strengths: scrubArray(parsed.strengths, forbiddenNames),
    areasForImprovement: scrubArray(parsed.areasForImprovement, forbiddenNames),
    actionableSteps: scrubArray(parsed.actionableSteps, forbiddenNames),
    feedbackComment: scrubOutput(String(parsed.feedbackComment ?? ""), forbiddenNames).text,
    toddleReport: scrubOutput(String(parsed.toddleReport ?? ""), forbiddenNames).text,
    atlFocus: parseAtlFocus(parsed.atlFocus, forbiddenNames),
  };

  upsertReport({ submission_id: submission.id, sections, status: "draft" });
  return { submissionId: submission.id, hasDataCorrelation: hasExternalData };
}

function scrubText(value: string | null, forbidden: string[]): string | null {
  if (value == null) return null;
  return scrubOutput(String(value), forbidden).text;
}
function scrubArray(value: unknown, forbidden: string[]): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => scrubOutput(String(v), forbidden).text);
}


/**
 * What the student met and missed in the criterion's own words, plus the one thing
 * standing between them and the next band. The feedback rule already asks for
 * band-language ("to move into the 7-8 bracket..."); this is what makes that
 * sentence specific instead of invented. Says nothing when the criterion has no
 * descriptors on file.
 */
function renderDescriptorBreakdown(
  criterion: string,
  descriptors: RubricDescriptorRow[],
  checkByDescriptorId: Map<number, DescriptorCheckRow>
): string {
  const mine = descriptors.filter((d) => d.criterion === criterion);
  if (mine.length === 0) return "";

  const isMet = (d: RubricDescriptorRow) => {
    const check = checkByDescriptorId.get(d.id);
    return (check?.met_final ?? check?.met_proposed ?? null) === 1;
  };
  // The official wording first, because that is where the command term lives
  // ("describe", "verify", "justify"); the student-facing line follows it so the
  // feedback can be written in words the student has already been given.
  const wording = (d: RubricDescriptorRow) =>
    d.student_text ? `${d.text} [to the student: ${d.student_text}]` : d.text;

  const suggestion = suggestLevel(mine.map((d) => ({ band: d.band, met: isMet(d) })));
  const met = mine.filter(isMet).map(wording);
  const unmet = mine.filter((d) => !isMet(d)).map(wording);

  // The next band up is where the gap belongs: name only what is missing there.
  const nextBandIndex = suggestion.band ? LEVEL_BANDS.indexOf(suggestion.band) + 1 : 0;
  const nextBand = LEVEL_BANDS[nextBandIndex];
  const missingNext = nextBand
    ? mine.filter((d) => d.band === nextBand && !isMet(d)).map(wording)
    : [];

  return (
    `\n  Descriptors met: ${met.length > 0 ? met.join(" | ") : "(none)"}` +
    `\n  Not met: ${unmet.length > 0 ? unmet.join(" | ") : "(none)"}` +
    (missingNext.length > 0
      ? `\n  Still needed for the ${nextBand} band: ${missingNext.join(" | ")}`
      : "")
  );
}

/**
 * What a points test is for. The Financial Math course has a year-long frame
 * the feedback should point at; any other course gets the plain version.
 */
function pointsTestContext(courseName: string): string {
  if (/financ/i.test(courseName)) {
    return `THIS IS A FORMATIVE TEST in a ${courseName} course: the score is points out of a total, for
feedback, not a grade. The student is a financial advisor to a fictional client all year; skills such as the
linear cashflow model (y = mx + b), APR vs APY, compound interest and the GDC finance solver feed their next
client deliverable. Frame areas and next steps as what to secure before that work.`;
  }
  return `THIS IS A FORMATIVE TEST in ${courseName} mathematics: the score is points out of a total, for feedback,
not a grade. Frame areas and next steps as what to secure before the next assessment on these skills.`;
}

function buildReportPrompt(args: {
  pseudonym: string;
  assessmentTitle: string;
  perQuestion: string;
  levelBlock: string;
  externalBlock: string;
  hasExternalData: boolean;
  referenceBlock: string;
  styleComments: string;
  structure: string;
  pointsOnly: boolean;
  hasDescriptors: boolean;
  /** "Grade 12 Financial Math", "Grade 9": what the test is for, in the teacher's words. */
  courseName: string;
}): string {
  const {
    pseudonym,
    assessmentTitle,
    perQuestion,
    levelBlock,
    externalBlock,
    hasExternalData,
    referenceBlock,
    styleComments,
    structure,
    pointsOnly,
    hasDescriptors,
    courseName,
  } = args;
  return `Write a full analytical report for student ${pseudonym} on the assessment "${assessmentTitle}".
Everything must be grounded in the graded evidence below. Do NOT invent facts, scores, or data.

CRITICAL — PRIVACY: Never write the student's real name. In the feedbackComment, address the student using the
literal token {{NAME}} (the tool re-injects the real name locally). Use "you" throughout the comment.

REPORT STRUCTURE TO FOLLOW:
${structure}

PER-QUESTION GRADING EVIDENCE:
${perQuestion}

${pointsOnly ? "SCORE" : "CRITERION LEVELS"}:
${levelBlock}
${
    pointsOnly
      ? `
${pointsTestContext(courseName)}
`
      : ""
  }
EXTERNAL DATA (MAP percentile/strand deltas, CAT4 SAS) for ${pseudonym}:
${externalBlock}
${hasExternalData ? `\n${EXTERNAL_DATA_INTERPRETATION_GUIDE}\n` : ""}
Reference data (previous year grades and ATL) for ${pseudonym}:
${referenceBlock}
This reference block is trajectory context only (e.g. compare the current criterion A level with last year's
criterion grade, or note an ATL pattern relevant to the areas for improvement / actionable steps). It is NOT part
of the Data Correlation section. If it says "(none on file)", do not invent prior grades or ATL values.

WRITING RULES:
1. Data Correlation: ${
    hasExternalData
      ? "cross-reference this assessment's performance with the MAP percentile/deltas and CAT4 SAS above, using the interpretation guide to explain what the numbers mean (potential vs. attainment), not just restate them. Be specific and honest."
      : "there is NO external data on file — return null for dataCorrelation. Do NOT invent MAP/CAT4 numbers."
  }
STYLE (applies to every section) — write for the STUDENT, in flowing prose, second person ("you"), and keep it
DIGESTIBLE: do NOT cite question numbers/labels ("Q3(b)") and do NOT quote point tallies ("4/6") or dump raw
values; refer to the SKILL/topic by name and keep only the substance (what was done well or went wrong and the
named technique). CONSOLIDATE related points — at most ~4-5 strengths and ~5-6 areas, the most important patterns,
not one per question. Short and clear beats exhaustive.
2. Strengths: a few skills the student handled well, naming the correct habit/technique they showed. No question
   numbers, no scores.
3. Areas for Improvement: name each specific error PATTERN and the skill it belongs to; be honest about blank
   work and pacing, but as a pattern, not a question-by-question list. No question numbers, no scores.
4. Actionable Steps: concrete, named techniques and drills (not generic advice). No question numbers.
${
    hasDescriptors
      ? `4b. COMMAND TERMS — for every criterion whose block above lists descriptors, the feedback must be about the
   command terms, not only the mathematics. Each descriptor is written around one: describe, verify, justify,
   prove, predict, state, select, apply, solve, use, write down. For each descriptor NOT met, name its command
   term explicitly, say what that term asks for (e.g. "verify" means showing the rule holds for a case you
   worked out independently, not re-substituting into it; "justify" means saying WHY it holds), and say what
   doing it would have looked like in THIS task. Say the same for the terms the student did handle well, so they
   can tell the two apart. Finish the Actionable Steps for that criterion by naming the one or two command terms
   to practise in the next assessment — these carry across tasks, which is the point of teaching them.
`
      : ""
  }
5. Feedback Comment: a SINGLE paragraph of roughly 70-90 words addressing the student as {{NAME}} using "you".
   Structure: a specific strength with evidence -> the specific errors that limited the score -> one actionable next
   step ${
     pointsOnly
       ? "tied to the skill the next unit deliverable needs (never mention levels or bands)"
       : 'tied to level-band language (e.g. "to move into the Level 7-8 bracket...")'
   }. Encouraging without inflating.
   Where the criterion block above lists "Still needed for the <band> band", that IS the next step — say it in
   plain student language, not rubric wording ("show that your rule still works for a figure you have not drawn",
   not "verify the validity of these general rules").
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
     - 2-4 short bullets drawn from Strengths, rewritten in easy student language (no jargon, no technique names
       the student wouldn't know, no question numbers, no scores).
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
