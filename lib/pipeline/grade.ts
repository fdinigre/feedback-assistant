import "server-only";

import { questionsForStudent } from "@/lib/assessment/course";
import { usesLevelThresholds } from "@/lib/assessment/bands";

import {
  getAssessment,
  getRubric,
  listCriterionLevels,
  listRubricDescriptors,
  getStudent,
  getSubmission,
  listLevelThresholds,
  listQuestions,
  getApplicableMarkingInstructions,
  getLearningTarget,
  listGradings,
  listTranscripts,
  listWorkedSolutions,
  updateSubmission,
  upsertCriterionLevel,
  upsertGrading,
} from "@/lib/db/queries";
import type {
  Criterion,
  RubricDescriptorRow,
  GradingQuestion,
  QuestionRow,
  TranscriptQuestion,
} from "@/lib/types";
import { getForbiddenNames, scrubOutput } from "@/lib/pipeline/guards";
import { blockingFlags } from "@/lib/submissions/review-state";
import { isCrossedOut } from "@/lib/submissions/transcript-edits";
import { descriptorKey, recordDescriptorChecks, type DescriptorJudgment } from "@/lib/marking/descriptor-checks";
import { taskDocumentsForGrading } from "@/lib/assessment/task-documents";
import { runClaudeJson } from "@/lib/pipeline/run";

/** Thrown when the precondition fails: illegible flags still awaiting the teacher. */
export class UnresolvedFlagsError extends Error {
  flags: { questionNumber: string; stepIndex: number; note: string }[];
  constructor(flags: { questionNumber: string; stepIndex: number; note: string }[]) {
    super(`grade: ${flags.length} illegible flag(s) still unresolved`);
    this.name = "UnresolvedFlagsError";
    this.flags = flags;
  }
}

type Pass1Item = {
  questionNumber: string;
  proposedPoints: number;
  evidence: string;
  followThrough: boolean;
};
/** Criterion C (Communication) folded into pass 1 so it costs no extra CLI call. */
type CommunicationJudgment = {
  level: number;
  conservativeLevel: number;
  evidence: string;
  /** Present only when Criterion C has band descriptors to tick off. */
  descriptors?: DescriptorJudgment[];
  bestFitArgument?: string;
};
type Pass1Response = {
  questions: Pass1Item[];
  communication?: CommunicationJudgment;
};
type Pass2Item = {
  questionNumber: string;
  conservativePoints: number;
  conservativeArgument: string;
};
type LevelProposal = {
  level: number;
  conservativeLevel: number;
  evidence: string;
  /** Present only when the criterion has band descriptors to tick off. */
  descriptors?: DescriptorJudgment[];
  /** The argument for the chosen level over the other one in its band. */
  bestFitArgument?: string;
};

export type GradeResult = {
  submissionId: number;
  gradedQuestions: number;
  criteria: { criterion: string; proposed: number; conservative: number }[];
};


/**
 * Renders one question's transcript for the grader, folding in the teacher's
 * illegible-flag resolutions:
 *   - resolvedText non-empty -> use the corrected text (teacher-confirmed).
 *   - resolvedText === ""     -> the segment is ungradeable: it earns NO credit
 *                                and that fact is stated so the grader accounts for it.
 * Precondition (checked before calling) guarantees no flag has resolvedText === undefined.
 */
/** Exported so scripts/omitted-steps-check.ts can prove an omitted line never reaches the model. */
export function renderResolvedTranscript(tq: TranscriptQuestion): string {
  if (tq.blank || tq.steps.length === 0) {
    return "(BLANK — the student showed no work for this question.)";
  }
  const flagByStep = new Map<number, { note: string; resolvedText?: string }>();
  for (const f of tq.illegible) flagByStep.set(f.stepIndex, f);

  // Lines the teacher has taken out of the answer are dropped here, and the
  // rest renumbered, so the model never sees working she has already said does
  // not count — and never sees a gap where it was.
  const lines = tq.steps
    .map((step, idx) => ({ step, idx }))
    .filter(({ step }) => !step.omitted)
    .map(({ step, idx }, position) => {
      const n = position + 1;
      const flag = flagByStep.get(idx);
      if (flag) {
        if (flag.resolvedText && flag.resolvedText.trim() !== "") {
          return `  ${n}. ${flag.resolvedText}   [teacher-corrected illegible segment]`;
        }
        if (flag.resolvedText === "") {
          return `  ${n}. ${step.text}   [UNGRADEABLE illegible segment — earns no credit: ${flag.note}]`;
        }
        // Still open on a line read in full (an open "[?]" never gets this far):
        // graded as written, with the reader's doubt beside it.
        return `  ${n}. ${step.text}   [low confidence — the reader noted: ${flag.note}]`;
      }
      // Work the student struck through: the grader must never credit it.
      if (isCrossedOut(step.text)) {
        return `  ${n}. ${step.text}   [CROSSED OUT — the student cancelled this work: it earns no credit]`;
      }
      const conf = step.confident ? "" : "   [low confidence]";
      return `  ${n}. ${step.text}${conf}`;
    });
  return lines.join("\n");
}

import { computeLevel } from "@/lib/assessment/levels";
export { computeLevel };

export async function gradeSubmission(submissionId: number): Promise<GradeResult> {
  const submission = getSubmission(submissionId);
  if (!submission) throw new Error(`grade: submission ${submissionId} not found`);
  if (submission.status === "absent") throw new Error(`grade: submission ${submissionId} is absent`);
  if (submission.student_id == null) {
    throw new Error(`grade: submission ${submissionId} has no student assigned`);
  }
  const student = getStudent(submission.student_id);
  if (!student) throw new Error(`grade: student ${submission.student_id} not found`);

  const assessment = getAssessment(submission.assessment_id);
  if (!assessment) throw new Error(`grade: assessment ${submission.assessment_id} not found`);
  const questions = questionsForStudent(listQuestions(assessment.id), student);
  const questionById = new Map(questions.map((q) => [q.id, q] as const));
  const transcripts = listTranscripts(submission.id);
  if (transcripts.length === 0) {
    throw new Error(`grade: submission ${submissionId} has no transcripts — transcribe first`);
  }

  // ---- Precondition: every illegible flag resolved or explicitly ungradeable ----
  const unresolved: { questionNumber: string; stepIndex: number; note: string }[] = [];
  for (const t of transcripts) {
    // Only an unreadable part still showing "[?]" holds the paper up. A flag on a
    // line read in full, or on a line taken out of the answer, does not — the same
    // rule the review screen colours by (lib/submissions/review-state.ts).
    for (const f of blockingFlags(t.content)) {
      unresolved.push({
        questionNumber: t.content.questionNumber,
        stepIndex: f.stepIndex,
        note: f.note,
      });
    }
  }
  if (unresolved.length > 0) throw new UnresolvedFlagsError(unresolved);

  const forbiddenNames = getForbiddenNames(student.class_id);
  const workedSolutions = listWorkedSolutions(assessment.id);
  const solutionNotes = workedSolutions
    .filter((w) => w.question_id == null)
    .map((w) => w.content)
    .join("\n\n");
  // The teacher's standing / per-assessment marking notes are folded into the notes
  // both passes see, flagged as overriding the defaults where they conflict.
  const markingNotes = getApplicableMarkingInstructions(assessment.id)
    .map((m) => `- ${m.text}`)
    .join("\n");
  const wholeNotes = markingNotes
    ? `${solutionNotes}${solutionNotes ? "\n\n" : ""}TEACHER'S MARKING NOTES (apply these; they override the defaults where they conflict):\n${markingNotes}`
    : solutionNotes;
  const perQuestionSolution = new Map<number, string>();
  for (const w of workedSolutions) {
    if (w.question_id != null) perQuestionSolution.set(w.question_id, w.content);
  }

  const criteria = assessment.criteria;
  const hasRubricCriteria = criteria.some((c) => c === "B" || c === "D");
  // Everything the task came with — task sheet, template, checklist, exemplar — read
  // by every pass, so the points, the C judgement and the B/D level all see the same task.
  const taskDocuments = taskDocumentsForGrading(assessment.id);

  // Ordered list pairing each transcript with its question definition.
  const items = transcripts
    .map((t) => ({ q: questionById.get(t.question_id), tq: t.content }))
    .filter((x): x is { q: QuestionRow; tq: TranscriptQuestion } => x.q !== undefined)
    .sort((a, b) => a.q.id - b.q.id);

  // ===================== PASS 1 — evidence-anchored grading =====================
  // Criterion C (Communication) is judged inside this same call (no extra CLI round-trip).
  const wantsCommunication = criteria.includes("C" as Criterion);
  // Keep the folded Criterion C judgment grounded in the teacher's own C rubric.
  const communicationRubric = wantsCommunication
    ? getRubric(assessment.id, "C")?.content ?? null
    : null;
  // C's descriptors are ticked off inside pass 1 rather than in a call of their own:
  // this is the only prompt that carries the student's actual working, which is what
  // communication is judged on — and it saves a CLI call per student across a class.
  const communicationDescriptors = wantsCommunication
    ? listRubricDescriptors(assessment.id, "C")
    : [];
  const pass1Raw = await runClaudeJson<Pass1Response | Pass1Item[]>({
    purpose: "grade-pass1",
    forbiddenNames,
    prompt: buildPass1Prompt({
      pseudonym: student.pseudonym,
      criteria,
      items,
      perQuestionSolution,
      wholeNotes,
      rubricText: hasRubricCriteria ? collectRubrics(assessment.id, criteria) : "",
      taskDocuments,
      wantsCommunication,
      communicationRubric,
      communicationDescriptors,
    }),
  });
  // Tolerate either the object shape { questions, communication } or a bare array.
  const pass1: Pass1Item[] = Array.isArray(pass1Raw) ? pass1Raw : pass1Raw.questions ?? [];
  const communication: CommunicationJudgment | undefined = Array.isArray(pass1Raw)
    ? undefined
    : pass1Raw.communication;
  const pass1ByNumber = new Map(pass1.map((p) => [String(p.questionNumber).trim(), p]));

  // ===================== PASS 2 — conservative second marker ====================
  const pass2 = await runClaudeJson<Pass2Item[]>({
    purpose: "grade-pass2",
    forbiddenNames,
    prompt: buildPass2Prompt({
      pseudonym: student.pseudonym,
      items,
      perQuestionSolution,
      wholeNotes,
      taskDocuments,
      pass1,
    }),
  });
  const pass2ByNumber = new Map(pass2.map((p) => [String(p.questionNumber).trim(), p]));

  // ---- Merge into GradingQuestion rows ----
  // Preserve any teacher-final point overrides from a previous grading — re-running the
  // AI must never silently discard a mark the teacher explicitly set.
  const priorFinalByQ = new Map<number, number>();
  for (const g of listGradings(submission.id)) {
    const f = (g.content as GradingQuestion).finalPoints;
    if (f != null) priorFinalByQ.set(g.question_id, f);
  }
  let proposedSum = 0;
  let conservativeSum = 0;
  const proposedByBand = new Map<string, number>();
  const conservativeByBand = new Map<string, number>();
  for (const { q } of items) {
    const num = q.number.trim();
    const p1 = pass1ByNumber.get(num);
    const p2 = pass2ByNumber.get(num);

    const proposed = clamp(p1?.proposedPoints ?? 0, 0, q.max_points);
    // Conservative pass may only LOWER; default to the proposed value when it is
    // missing or tries to raise the mark.
    const rawConservative = p2?.conservativePoints ?? proposed;
    const conservative = clamp(Math.min(rawConservative, proposed), 0, q.max_points);
    const passesAgree = conservative === proposed;

    const evidence = scrubOutput(p1?.evidence ?? "No evidence returned.", forbiddenNames).text;
    const conservativeArgument = passesAgree
      ? null
      : scrubOutput(p2?.conservativeArgument ?? "", forbiddenNames).text || null;

    const priorFinal = priorFinalByQ.get(q.id);
    const grading: GradingQuestion = {
      questionNumber: q.number,
      proposedPoints: proposed,
      conservativePoints: conservative,
      // Keep the teacher's final override if one was set (clamped to the new max).
      finalPoints: priorFinal != null ? clamp(priorFinal, 0, q.max_points) : null,
      evidence,
      followThrough: Boolean(p1?.followThrough),
      conservativeArgument,
    };
    upsertGrading({ submission_id: submission.id, question_id: q.id, content: grading });
    proposedSum += proposed;
    conservativeSum += conservative;
    if (!q.level_band) {
      // Band points only ever feed Criterion A. Without it — a Criterion B task
      // marked on the rubric, a points-only test — there is nothing to total.
      if (!usesLevelThresholds(assessment)) continue;
      throw new Error(`grade: question ${q.id} has no level_band (MYP pipeline requires one)`);
    }
    proposedByBand.set(q.level_band, (proposedByBand.get(q.level_band) ?? 0) + proposed);
    conservativeByBand.set(q.level_band, (conservativeByBand.get(q.level_band) ?? 0) + conservative);
  }

  // ---- Criterion levels ----
  // A level the teacher set herself is a judgement about this student's work, so a
  // re-grade keeps it, the same way it keeps her final marks and her descriptor ticks.
  // Criterion A is the exception: its level is arithmetic on the marks that have just
  // been recalculated, so an old final level would simply be stale.
  const priorFinalLevel = new Map(
    listCriterionLevels(submission.id).map((l) => [l.criterion, l.level_final])
  );
  const thresholds = listLevelThresholds(assessment.id);
  const criteriaOut: GradeResult["criteria"] = [];
  let aLevelForAnchor: number | null = null;

  for (const criterion of criteria) {
    if (criterion === "A") {
      const proposedLevel = computeLevel(proposedByBand, thresholds);
      const conservativeLevel = computeLevel(conservativeByBand, thresholds);
      const bandBreakdown = [...proposedByBand.entries()]
        .sort()
        .map(([band, pts]) => `${band}: ${pts}`)
        .join(", ");
      const evidence = `Criterion A from per-band boundaries (points by band: ${bandBreakdown}; total ${proposedSum}) -> level ${proposedLevel} (conservative -> ${conservativeLevel}).`;
      upsertCriterionLevel({
        submission_id: submission.id,
        criterion,
        level_proposed: proposedLevel,
        level_conservative: conservativeLevel,
        evidence,
      });
      criteriaOut.push({ criterion, proposed: proposedLevel, conservative: conservativeLevel });
      aLevelForAnchor = proposedLevel;
    } else if (criterion === "C" && communication) {
      // Criterion C was judged in pass 1 — no extra CLI call. Apply the teacher's
      // anchor rule locally: C almost always lands within 1 of A, at most 2 away.
      const anchor = aLevelForAnchor;
      const clampToAnchor = (lvl: number) =>
        anchor == null ? lvl : Math.max(anchor - 2, Math.min(anchor + 2, lvl));
      const proposedLevel = clampLevel(clampToAnchor(communication.level));
      const conservativeLevel = clampLevel(
        clampToAnchor(Math.min(communication.conservativeLevel, communication.level))
      );
      const anchorNote =
        anchor != null && (communication.level < anchor - 2 || communication.level > anchor + 2)
          ? ` (clamped toward Criterion A level ${anchor} per the ±2 rule)`
          : "";
      if (communicationDescriptors.length > 0) {
        recordDescriptorChecks(
          submission.id,
          communicationDescriptors,
          communication.descriptors,
          forbiddenNames
        );
      }
      const cBestFit = communication.bestFitArgument?.trim();
      upsertCriterionLevel({
        submission_id: submission.id,
        criterion,
        level_proposed: proposedLevel,
        level_conservative: conservativeLevel,
        level_final: priorFinalLevel.get(criterion) ?? null,
        evidence: scrubOutput(
          (communication.evidence ?? "") + anchorNote + (cBestFit ? `\n\nBest fit: ${cBestFit}` : ""),
          forbiddenNames
        ).text,
      });
      criteriaOut.push({ criterion, proposed: proposedLevel, conservative: conservativeLevel });
    } else {
      // B / D (and C as a fallback if pass 1 didn't return it) — level judged from a
      // rubric with cited evidence in its own call.
      const levels = await judgeLevelInOwnCall({
        submissionId: submission.id,
        assessmentId: assessment.id,
        criterion,
        pseudonym: student.pseudonym,
        items,
        pass1,
        taskDocuments,
        aLevelAnchor: criterion === "C" ? aLevelForAnchor : null,
        priorFinal: priorFinalLevel.get(criterion) ?? null,
        forbiddenNames,
      });
      criteriaOut.push({ criterion, ...levels });
    }
  }

  updateSubmission(submission.id, { status: "graded" });
  return { submissionId: submission.id, gradedQuestions: items.length, criteria: criteriaOut };
}

/**
 * A criterion's level judged in a call of its own, from a rubric with cited
 * evidence. Where the teacher has split that rubric into band descriptors, the same
 * call ticks each one off and argues the best fit between the two levels of its
 * band. Stores the level and the ticks; a level the teacher set is kept.
 */
async function judgeLevelInOwnCall(args: {
  submissionId: number;
  assessmentId: number;
  criterion: Criterion;
  pseudonym: string;
  items: { q: QuestionRow; tq: TranscriptQuestion }[];
  pass1: Pass1Item[];
  taskDocuments: string;
  aLevelAnchor: number | null;
  priorFinal: number | null;
  forbiddenNames: string[];
}): Promise<{ proposed: number; conservative: number }> {
  const { submissionId, assessmentId, criterion, forbiddenNames } = args;
  const rubric = getRubric(assessmentId, criterion);
  const descriptors = listRubricDescriptors(assessmentId, criterion);
  const proposal = await runClaudeJson<LevelProposal>({
    purpose: descriptors.length > 0 ? `grade-descriptors-${criterion}` : `grade-level-${criterion}`,
    forbiddenNames,
    prompt: buildLevelPrompt({
      pseudonym: args.pseudonym,
      criterion,
      rubricContent: rubric?.content ?? null,
      descriptors,
      items: args.items,
      pass1: args.pass1,
      taskDocuments: args.taskDocuments,
      aLevelAnchor: args.aLevelAnchor,
    }),
  });
  if (descriptors.length > 0) {
    recordDescriptorChecks(submissionId, descriptors, proposal.descriptors, forbiddenNames);
  }
  const proposed = clampLevel(proposal.level);
  const conservative = clampLevel(Math.min(proposal.conservativeLevel, proposal.level));
  const bestFit = proposal.bestFitArgument?.trim();
  upsertCriterionLevel({
    submission_id: submissionId,
    criterion,
    level_proposed: proposed,
    level_conservative: conservative,
    level_final: args.priorFinal,
    evidence: scrubOutput(
      bestFit ? `${proposal.evidence ?? ""}\n\nBest fit: ${bestFit}` : proposal.evidence ?? "",
      forbiddenNames
    ).text,
  });
  return { proposed, conservative };
}

/**
 * One criterion's level for a paper that is already marked — for a criterion added
 * to the assessment after grading (a test set up as Criterion A that assesses C as
 * well). The points are not marked again, so nothing the teacher settled moves: the
 * level is judged from the marks and evidence on file and the student's own work,
 * in the call a criterion gets when pass 1 did not judge it. Criterion A is not
 * judged — it is arithmetic on the marks.
 */
export async function gradeCriterionLevel(
  submissionId: number,
  criterion: Criterion
): Promise<{ submissionId: number; criterion: Criterion; proposed: number; conservative: number }> {
  const submission = getSubmission(submissionId);
  if (!submission) throw new Error(`grade: submission ${submissionId} not found`);
  if (submission.student_id == null) throw new Error(`grade: submission ${submissionId} has no student assigned`);
  const student = getStudent(submission.student_id);
  if (!student) throw new Error(`grade: student ${submission.student_id} not found`);
  const assessment = getAssessment(submission.assessment_id);
  if (!assessment) throw new Error(`grade: assessment ${submission.assessment_id} not found`);
  if (criterion === "A") throw new Error("Criterion A comes from the marks — grade the paper again to work it out.");
  if (!assessment.criteria.includes(criterion)) {
    throw new Error(`This assessment does not assess Criterion ${criterion}.`);
  }

  const gradings = listGradings(submission.id);
  if (gradings.length === 0) throw new Error("This paper isn't graded yet — grade it, and every criterion is judged.");
  const transcripts = listTranscripts(submission.id);
  const unresolved = transcripts.flatMap((t) =>
    blockingFlags(t.content).map((f) => ({ questionNumber: t.content.questionNumber, stepIndex: f.stepIndex, note: f.note }))
  );
  if (unresolved.length > 0) throw new UnresolvedFlagsError(unresolved);

  const questionById = new Map(questionsForStudent(listQuestions(assessment.id), student).map((q) => [q.id, q] as const));
  const items = transcripts
    .map((t) => ({ q: questionById.get(t.question_id), tq: t.content }))
    .filter((x): x is { q: QuestionRow; tq: TranscriptQuestion } => x.q !== undefined)
    .sort((a, b) => a.q.id - b.q.id);
  // The marking on file stands in for pass 1: the mark the app has now — the
  // teacher's where she set one — and the evidence written for it.
  const pass1: Pass1Item[] = items.flatMap(({ q }) => {
    const content = gradings.find((g) => g.question_id === q.id)?.content as GradingQuestion | undefined;
    if (!content) return [];
    return [
      {
        questionNumber: q.number,
        proposedPoints: content.finalPoints ?? content.conservativePoints,
        evidence: content.evidence,
        followThrough: content.followThrough,
      },
    ];
  });
  const levels = listCriterionLevels(submission.id);
  const a = levels.find((l) => l.criterion === "A");
  const result = await judgeLevelInOwnCall({
    submissionId: submission.id,
    assessmentId: assessment.id,
    criterion,
    pseudonym: student.pseudonym,
    items,
    pass1,
    taskDocuments: taskDocumentsForGrading(assessment.id),
    aLevelAnchor: criterion === "C" && a ? a.level_final ?? a.level_proposed : null,
    priorFinal: levels.find((l) => l.criterion === criterion)?.level_final ?? null,
    forbiddenNames: getForbiddenNames(student.class_id),
  });
  return { submissionId: submission.id, criterion, ...result };
}


// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

/**
 * The teacher reads every evidence line, so they are written for her, not as a
 * transcript of the marking. The rules below were distilled from her own rewrite
 * of an over-long one: cite the step, say what it achieved, and stop.
 */
const EVIDENCE_STYLE = `HOW TO WRITE EVIDENCE — these lines are read by the teacher, so keep them short and specific:
- Cite the step numbers and say what the step ACHIEVED. Do NOT reproduce the student's numbers,
  tables, substitutions or algebra. Write "steps 12-17 solve for the correct equation", not
  "steps 12-17 solve 6 = 3(1) + b to b = 3, giving y = 3x + 3". Write "steps 20-25 substitute
  correctly for figure 4 and figure 5", not "... for figure 4 (15 stars) and figure 5 (18 stars)".
- Quote the student's own words ONLY where the wording itself is the evidence — a stated reason or
  conclusion, e.g. step 9 gives the structural reason ("stars were added in a \\ shape").
- NEVER restate the worked solution's (or an exemplar's) version or compare notations ("the key's rule s = 3n + 3").
  The teacher knows her own key; she is reading this to see what the STUDENT did.
- Do NOT append caveats about slips that do not change the judgement.
- One short clause per requirement, in the student's order of working.`;

/**
 * The teacher's free-text rubric notes. Where she has band descriptors on file, those
 * are what the judgement is made against and these notes are background — saying so
 * matters, because an edited descriptor would otherwise be contradicted by a note
 * written before the edit.
 */
function collectRubrics(assessmentId: number, criteria: Criterion[]): string {
  const parts: string[] = [];
  for (const c of criteria) {
    if (c === "B" || c === "D") {
      const r = getRubric(assessmentId, c);
      if (!r || r.content.trim() === "") continue;
      const hasDescriptors = listRubricDescriptors(assessmentId, c).length > 0;
      const heading = hasDescriptors
        ? `TEACHER'S RUBRIC NOTES — Criterion ${c} (background; the band descriptors are the authority)`
        : `TASK-SPECIFIC RUBRIC — Criterion ${c}`;
      parts.push(`${heading}:\n${r.content}`);
    }
  }
  return parts.join("\n\n");
}

function renderItemsBlock(
  items: { q: QuestionRow; tq: TranscriptQuestion }[],
  perQuestionSolution: Map<number, string>
): string {
  return items
    .map(({ q, tq }) => {
      const sol = perQuestionSolution.get(q.id);
      const target = q.learning_target_id != null ? getLearningTarget(q.learning_target_id) : undefined;
      return `--- Question ${q.number} (max ${q.max_points} points${target ? ` · learning target: ${target.name}` : ""}) ---
STUDENT WORK (transcribed):
${renderResolvedTranscript(tq)}
${sol ? `WORKED SOLUTION (reference):\n${sol}` : "WORKED SOLUTION: (see whole-assessment notes)"}`;
    })
    .join("\n\n");
}

function buildPass1Prompt(args: {
  pseudonym: string;
  criteria: Criterion[];
  items: { q: QuestionRow; tq: TranscriptQuestion }[];
  perQuestionSolution: Map<number, string>;
  wholeNotes: string;
  rubricText: string;
  taskDocuments?: string;
  wantsCommunication: boolean;
  communicationRubric?: string | null;
  communicationDescriptors?: RubricDescriptorRow[];
}): string {
  const {
    pseudonym,
    criteria,
    items,
    perQuestionSolution,
    wholeNotes,
    rubricText,
    taskDocuments = "",
    wantsCommunication,
    communicationRubric,
    communicationDescriptors = [],
  } = args;
  const rubricCriteria = criteria.filter((c) => c === "B" || c === "D");
  return `You are grading a MYP mathematics assessment for student ${pseudonym}. Criteria assessed: ${criteria.join(", ")}.
Grade STRICTLY from the transcribed student work below against the worked solution. Award partial credit as the worked solution allows.

RULES:
1. EVIDENCE BEFORE JUDGMENT. Every point you award OR deny must cite the specific step of the student's work.
   Example: "Step 2 correctly applies the cosine rule; step 4 divides by 2 instead of 3 -> 1 of 2 marks."
   No evidence, no claim.
2. FOLLOW-THROUGH. An error carried forward does NOT get re-penalized in later steps: if the method after a
   wrong intermediate value is correct, award the method marks per the worked solution. Set followThrough:true
   for a question when you applied a follow-through allowance.
2b. ROUNDING LENIENCY (teacher's standing rule): a final answer whose VALUE is correct but is not rounded to the
   instructed precision (e.g. 4 s.f. instead of 3 s.f., or left unrounded) still earns its answer mark. Note the
   rounding slip in the evidence (it belongs to the Criterion C conversation), but do not withhold the mark for it.
3. A BLANK question earns 0 — say so plainly in the evidence.
4. An "[UNGRADEABLE illegible segment]" line earns no credit for that segment; grade only what is legible.
   Steps prefixed "[scratch]" are rough work the teacher excluded from grading — do not award or deduct
   marks for them (the teacher removes the prefix to include a step).
   TEACHER'S STANDING RULE: a step marked "[CROSSED OUT …]" earns NO credit even if it is mathematically
   correct — the student rejected that work. Never award marks based on crossed-out content, and never
   let it stand in for a step the student did not write.
${
    rubricCriteria.length > 0
      ? `5. For criteria ${rubricCriteria.join("/")}, the worked solution is a REFERENCE, not a rigid answer key.
   The student's solution path may legitimately differ — judge mathematical validity against the RUBRIC below,
   not similarity to the reference.`
      : "5. Judge purely on mathematical correctness against the worked solution."
}

${EVIDENCE_STYLE}

${wholeNotes ? `WHOLE-ASSESSMENT WORKED-SOLUTION NOTES:\n${wholeNotes}\n` : ""}${rubricText ? `${rubricText}\n` : ""}${taskDocuments ? `${taskDocuments}\n` : ""}
${renderItemsBlock(items, perQuestionSolution)}
${
    wantsCommunication
      ? `
ALSO JUDGE CRITERION C (COMMUNICATION), 0-8, from the QUALITY of the working across the whole paper:
is the working shown and easy to follow, is mathematical language/notation used correctly, is the
solution logically structured? This is about HOW the maths is communicated, not whether answers are
correct.${
          communicationRubric
            ? ` Judge strictly against this Criterion C rubric:\n${communicationRubric}\n`
            : ""
        }${
          communicationDescriptors.length > 0
            ? `
DESCRIPTORS TO JUDGE for Criterion C — decide each one SEPARATELY, from the working above:
${renderDescriptorBlock(communicationDescriptors)}

Return one object per descriptor under "descriptors", reusing its key EXACTLY as given, in the same
order. Never invent a key, merge two descriptors or split one. "met" is true only if the working
actually shows it; "evidence" cites what you saw, or says plainly what is missing.

HOW THE LEVEL FOLLOWS (the teacher's rule — a band covers two levels): every statement of a band met
-> that band's UPPER level; half or more met -> its LOWER level; a band only partly met but with
statements met in a HIGHER band MAY balance up to the upper level, or may not. Make that judgement
and give it as "bestFitArgument": the two levels you were choosing between, and why this work fits
the one you chose.
`
            : ""
        } Give "level" (your judgment against the descriptors), "conservativeLevel" (the same or
lower if you are being strict), and one sentence of "evidence" citing what you saw across the questions.
`
      : ""
}
Return ONLY strict JSON${
    wantsCommunication
      ? `, an object exactly:
{ "questions": [ { "questionNumber": "<string>", "proposedPoints": <number>, "evidence": "<string citing specific steps>", "followThrough": <true|false> } ],
  "communication": { "level": <0-8>, "conservativeLevel": <0-8>, "evidence": "<one sentence>"${
          communicationDescriptors.length > 0
            ? `,
    "descriptors": [ { "key": "<d12>", "met": <true|false>, "evidence": "<string>" } ],
    "bestFitArgument": "<string>"`
            : ""
        } } }`
      : `: an array with one object per question, each exactly:
{ "questionNumber": "<string>", "proposedPoints": <number>, "evidence": "<string citing specific steps>", "followThrough": <true|false> }`
  }
No prose, no code fences.`;
}

function buildPass2Prompt(args: {
  pseudonym: string;
  items: { q: QuestionRow; tq: TranscriptQuestion }[];
  perQuestionSolution: Map<number, string>;
  wholeNotes: string;
  taskDocuments?: string;
  pass1: Pass1Item[];
}): string {
  const { pseudonym, items, perQuestionSolution, wholeNotes, taskDocuments = "", pass1 } = args;
  return `You are a SKEPTICAL SECOND MARKER re-checking a first marker's grading of student ${pseudonym}'s MYP mathematics assessment.
Your job is ONLY to find where the first pass was too GENEROUS and to LOWER points where the student's actual work does not support them.
You may NEVER raise a mark. If the evidence fully supports the first pass, keep the same number and leave conservativeArgument empty.

Be suspicious of: marks awarded despite missing justification, arithmetic the first pass overlooked, credit for steps that are actually wrong or illegible, and generous rounding. Cite the specific step in your argument whenever you lower a mark.

${EVIDENCE_STYLE}

${wholeNotes ? `WHOLE-ASSESSMENT WORKED-SOLUTION NOTES:\n${wholeNotes}\n` : ""}${taskDocuments ? `${taskDocuments}\n` : ""}
${renderItemsBlock(items, perQuestionSolution)}

FIRST-PASS GRADING TO SCRUTINIZE:
${JSON.stringify(pass1, null, 2)}

Return ONLY strict JSON: an array with one object per question, each exactly:
{ "questionNumber": "<string>", "conservativePoints": <number, <= the first-pass points>, "conservativeArgument": "<why you lowered it, citing the step; empty string if unchanged>" }
No prose, no code fences.`;
}

/** The student's work alone — no answer key, because this judgement is against descriptors. */
function renderWorkBlock(items: { q: QuestionRow; tq: TranscriptQuestion }[]): string {
  return items
    .map(({ q, tq }) => `--- Question ${q.number} ---\n${renderResolvedTranscript(tq)}`)
    .join("\n\n");
}

/** The descriptors to tick off, each with the key the answer must come back under. */
function renderDescriptorBlock(descriptors: RubricDescriptorRow[]): string {
  return descriptors
    .map(
      (d) =>
        `[${d.band}] ${descriptorKey(d)}${d.strand ? ` (strand ${d.strand})` : ""} ${d.text}` +
        (d.student_text ? `\n        as the student was told: ${d.student_text}` : "")
    )
    .join("\n");
}

function buildLevelPrompt(args: {
  pseudonym: string;
  criterion: string;
  rubricContent: string | null;
  descriptors: RubricDescriptorRow[];
  items: { q: QuestionRow; tq: TranscriptQuestion }[];
  pass1: Pass1Item[];
  taskDocuments?: string;
  aLevelAnchor?: number | null;
}): string {
  const { pseudonym, criterion, rubricContent, descriptors, items, pass1, taskDocuments = "", aLevelAnchor } = args;
  const anchorNote =
    aLevelAnchor != null
      ? `\nCALIBRATION (teacher's standing rule): Criterion C almost always lands within 1 level of Criterion A. ` +
        `This student's proposed Criterion A level is ${aLevelAnchor}. Only propose a C level more than 1 away from A ` +
        `if the rubric descriptors clearly support it (2 away at most, never more), and say why in the evidence.\n`
      : "";
  const evidenceBlock = items
    .map(({ q }) => {
      const p = pass1.find((x) => String(x.questionNumber).trim() === q.number.trim());
      return `- Q${q.number}: ${p ? `${p.proposedPoints} pts — ${p.evidence}` : "(no grading)"}`;
    })
    .join("\n");
  return `Propose the MYP Criterion ${criterion} level (0-8) for student ${pseudonym}, based ONLY on cited evidence from their graded work.
${anchorNote}

${
    rubricContent && rubricContent.trim() !== ""
      ? descriptors.length > 0
        ? `TEACHER'S RUBRIC NOTES — Criterion ${criterion} (background. Where these and the band descriptors below disagree, the DESCRIPTORS decide):\n${rubricContent}`
        : `TASK-SPECIFIC RUBRIC — Criterion ${criterion}:\n${rubricContent}`
      : descriptors.length > 0
        ? `The band descriptors below are the rubric for Criterion ${criterion}.`
        : `No task-specific rubric is on file for Criterion ${criterion}. Judge the level from the communication/quality evidence noted during grading (clarity of method, use of notation, coherence of the mathematical argument).`
}
${taskDocuments ? `\n${taskDocuments}\n` : ""}
PER-QUESTION EVIDENCE FROM GRADING (the points marking, for reference):
${evidenceBlock}
${
    descriptors.length > 0
      ? `
THE STUDENT'S WORK, as transcribed:
${renderWorkBlock(items)}

DESCRIPTORS TO JUDGE — decide each one SEPARATELY, against the work above:
${renderDescriptorBlock(descriptors)}

For every descriptor listed, return one object reusing its key EXACTLY as given (d12, d13, ...),
in the same order. Never invent a key, never merge two descriptors, never split one. "met" is true
only if the work actually shows it; "evidence" cites the step or question that shows it, or says
plainly what is missing.

HOW THE LEVEL FOLLOWS (the teacher's rule — a band covers two levels):
- Every statement of a band met -> the UPPER level of that band (all of 5-6 met -> 6).
- Half or more of them met -> the LOWER level (two of the three 5-6 statements -> 5).
- A band only partly met, but statements met in a HIGHER band, MAY balance out to that band's
  upper level — or may not. That is a judgement, so make it and argue it.
Return "bestFitArgument": name the two levels you were choosing between and say, in one or two
sentences, why the work fits the one you chose. The teacher sets the final level; this argument is
what she reads to agree or disagree.
`
      : ""
}
${EVIDENCE_STYLE}

Give a "level" (your best judgment) and a "conservativeLevel" (a skeptical second read that only stays the same or goes LOWER). Cite evidence for the level in "evidence".

Return ONLY strict JSON, exactly:
${
    descriptors.length > 0
      ? `{ "descriptors": [ { "key": "<d12>", "met": <true|false>, "evidence": "<string citing the work>" } ],
  "level": <0-8>, "conservativeLevel": <0-8, <= level>,
  "bestFitArgument": "<string>", "evidence": "<string citing question evidence>" }`
      : `{ "level": <0-8>, "conservativeLevel": <0-8, <= level>, "evidence": "<string citing question evidence>" }`
  }
No prose, no code fences.`;
}

// ---------------------------------------------------------------------------

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
function clampLevel(n: number): number {
  return Math.round(clamp(n, 0, 8));
}
