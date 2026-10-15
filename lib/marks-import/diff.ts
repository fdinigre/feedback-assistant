import "server-only";

import {
  listGradings,
  listQuestions,
  listStudents,
  listSubmissions,
} from "@/lib/db/queries";
import type { AssessmentRow, DpGradingQuestion, QuestionRow, StudentRow } from "@/lib/types";
import { questionsForStudent } from "@/lib/assessment/course";
import { pickFinal, sumQuestionMarks, sumSubpartMarks } from "@/lib/submissions/dp-calc";
import { canonicalPart, dpLabelTarget, labelToQuestionNumber, type ParsedMarksSheet } from "./parse";

/**
 * Compares a marks spreadsheet against the marks already in the app and
 * describes every difference, so the teacher decides what to apply rather than
 * the upload deciding for them.
 */

export type MarkChange = {
  submissionId: number;
  studentName: string;
  questionId: number;
  questionNumber: string;
  /** The DP markscheme part the column marks ("a", "b.ii"); '' for the whole question. */
  part: string;
  label: string;
  maxPoints: number;
  /** What the app currently has (teacher override if set, else the AI's mark). */
  current: number | null;
  /** What the sheet says. A blank cell counts as 0. */
  incoming: number;
  /** The sheet cell was empty and is being read as zero. */
  fromBlank: boolean;
  /** The sheet's mark is above the question's maximum. */
  overMax: boolean;
};

export type MarksDiff = {
  changes: MarkChange[];
  /** Marks that already agree. */
  unchanged: number;
  /** Sheet rows whose name matched no student in this class. */
  unmatchedNames: string[];
  /** Sheet question columns with no matching question in the assessment. */
  unmatchedLabels: string[];
  /** Students on the roster with no row in the sheet. */
  missingFromSheet: string[];
  /** Sheet rows matching a student who has no submission to mark. */
  withoutSubmission: string[];
  ignoredColumns: string[];
  /** Question columns read as subtotals, because the sheet also marks that question's parts (DP). */
  subtotalColumns: string[];
  /** Papers the sheet has a row for, whether or not anything on them differs. */
  coveredSubmissions: number[];
};

/** The mark the app treats as current: the teacher's override, else the AI's. */
function sitsQuestion(question: Pick<QuestionRow, "variant">, student: Pick<StudentRow, "modified">): boolean {
  return questionsForStudent([question], student).length === 1;
}

function effectivePoints(content: { finalPoints: number | null; conservativePoints: number }): number {
  return content.finalPoints ?? content.conservativePoints;
}

/** What one sheet column marks: a question, or one part of it. */
type Target = { question: QuestionRow; part: string; maxPoints: number };

/**
 * How a programme's sheet columns map onto its questions, and what the app has
 * for each. MYP marks whole questions (its sub-parts are questions of their own,
 * "4a"); a Diploma paper keeps its parts inside one question, so its columns can
 * mark the question (Q2) or one part of it (Q1a, Q5b(ii)).
 */
type Resolver = {
  target: (label: string) => Target | null;
  /** Whole-question columns read as subtotals because the sheet also marks their parts. */
  subtotals: string[];
  current: (submissionId: number, target: Target) => number | null;
};

/**
 * What the app has now for one question — or, on a Diploma paper, one part of it
 * ('' is the whole question): the teacher's mark where one is set, else the AI's.
 * Null when the app hasn't marked it. The comparison and the settled list both read
 * marks through this, so they can never disagree about what "the app's mark" is.
 */
export function currentMark(
  assessment: Pick<AssessmentRow, "programme">,
  question: QuestionRow,
  part: string,
  submissionId: number
): number | null {
  const content = listGradings(submissionId).find((g) => g.question_id === question.id)?.content;
  if (!content) return null;
  if (assessment.programme !== "DP") return effectivePoints(content);
  const dp = content as unknown as DpGradingQuestion;
  return part === ""
    ? sumQuestionMarks(dp, question.dp_scheme, pickFinal)
    : sumSubpartMarks(dp, question.dp_scheme, part, pickFinal);
}

function mypResolver(questions: QuestionRow[]): Resolver {
  const byNumber = new Map(questions.map((q) => [q.number.trim().toLowerCase(), q]));
  return {
    target(label) {
      const question = byNumber.get(labelToQuestionNumber(label));
      return question ? { question, part: "", maxPoints: question.max_points } : null;
    },
    subtotals: [],
    current: (submissionId, target) => currentMark({ programme: "MYP" }, target.question, "", submissionId),
  };
}

function dpResolver(questions: QuestionRow[], labels: string[]): Resolver {
  const byNumber = new Map(questions.map((q) => [q.number.trim().toLowerCase(), q]));
  const targetOf = (label: string): Target | null => {
    const t = dpLabelTarget(label);
    const question = t ? byNumber.get(t.number) : undefined;
    if (!t || !question) return null;
    if (t.part === "") return { question, part: "", maxPoints: question.max_points };
    const subpart = question.dp_scheme?.subparts.find((sp) => canonicalPart(sp.label) === t.part);
    return subpart ? { question, part: subpart.label, maxPoints: subpart.maxMarks } : null;
  };
  // A sheet that marks a question's parts and also has a column for the question
  // carries that column as a subtotal; comparing both would count the parts twice.
  const withParts = new Set(
    labels.map(targetOf).filter((t): t is Target => !!t && t.part !== "").map((t) => t.question.id)
  );
  const subtotals = labels.filter((label) => {
    const t = targetOf(label);
    return !!t && t.part === "" && withParts.has(t.question.id);
  });
  return {
    target: (label) => (subtotals.includes(label) ? null : targetOf(label)),
    subtotals,
    current: (submissionId, target) => currentMark({ programme: "DP" }, target.question, target.part, submissionId),
  };
}

export function buildMarksDiff(assessment: AssessmentRow, sheet: ParsedMarksSheet): MarksDiff {
  const questions = listQuestions(assessment.id);
  const resolver =
    assessment.programme === "DP"
      ? dpResolver(questions, sheet.questionLabels)
      : mypResolver(questions);

  // Only this assessment's class can be marked by this sheet.
  const roster = assessment.class_id !== null ? listStudents(assessment.class_id) : listStudents();
  const studentByName = new Map(roster.map((s) => [s.name.trim().toLowerCase(), s]));

  const submissions = listSubmissions(assessment.id).filter((s) => s.status !== "absent");
  const submissionByStudent = new Map(
    submissions.filter((s) => s.student_id !== null).map((s) => [s.student_id as number, s])
  );

  const changes: MarkChange[] = [];
  const unmatchedNames: string[] = [];
  const withoutSubmission: string[] = [];
  const seenStudentIds = new Set<number>();
  const coveredSubmissions: number[] = [];
  let unchanged = 0;

  const unmatchedLabels = sheet.questionLabels.filter(
    (label) => !resolver.subtotals.includes(label) && !resolver.target(label)
  );

  for (const row of sheet.rows) {
    const student = studentByName.get(row.name.trim().toLowerCase());
    if (!student) {
      unmatchedNames.push(row.name);
      continue;
    }
    seenStudentIds.add(student.id);

    const submission = submissionByStudent.get(student.id);
    if (!submission) {
      withoutSubmission.push(student.name);
      continue;
    }
    coveredSubmissions.push(submission.id);

    for (const [label, mark] of row.marks) {
      const target = resolver.target(label);
      if (!target) continue; // reported via unmatchedLabels, or a subtotal
      const { question } = target;
      // A question this student does not sit (the other version of the test)
      // is not a difference, whatever the cell says.
      if (!sitsQuestion(question, student)) continue;

      // A blank cell means the student scored nothing on that question.
      const incoming = mark ?? 0;
      const current = resolver.current(submission.id, target);

      if (current !== null && current === incoming) {
        unchanged++;
        continue;
      }

      changes.push({
        submissionId: submission.id,
        studentName: student.name,
        questionId: question.id,
        questionNumber: question.number,
        part: target.part,
        label,
        maxPoints: target.maxPoints,
        current,
        incoming,
        fromBlank: mark === null,
        overMax: incoming > target.maxPoints,
      });
    }
  }

  const missingFromSheet = roster
    .filter((s) => !seenStudentIds.has(s.id) && submissionByStudent.has(s.id))
    .map((s) => s.name);

  return {
    changes,
    unchanged,
    unmatchedNames,
    unmatchedLabels,
    missingFromSheet,
    withoutSubmission,
    ignoredColumns: sheet.ignoredColumns,
    subtotalColumns: resolver.subtotals,
    coveredSubmissions,
  };
}
