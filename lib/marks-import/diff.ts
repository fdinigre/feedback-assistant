import "server-only";

import {
  listGradings,
  listQuestions,
  listStudents,
  listSubmissions,
} from "@/lib/db/queries";
import type { AssessmentRow, QuestionRow, StudentRow } from "@/lib/types";
import { questionsForStudent } from "@/lib/assessment/course";
import { labelToQuestionNumber, type ParsedMarksSheet } from "./parse";

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

export function buildMarksDiff(assessment: AssessmentRow, sheet: ParsedMarksSheet): MarksDiff {
  const questions = listQuestions(assessment.id);
  const questionByNumber = new Map(questions.map((q) => [q.number.trim().toLowerCase(), q]));

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
    (label) => !questionByNumber.has(labelToQuestionNumber(label))
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

    const gradingByQuestion = new Map(listGradings(submission.id).map((g) => [g.question_id, g]));

    for (const [label, mark] of row.marks) {
      const question = questionByNumber.get(labelToQuestionNumber(label));
      if (!question) continue; // reported via unmatchedLabels
      // A question this student does not sit (the other version of the test)
      // is not a difference, whatever the cell says.
      if (!sitsQuestion(question, student)) continue;

      // A blank cell means the student scored nothing on that question.
      const incoming = mark ?? 0;
      const grading = gradingByQuestion.get(question.id);
      const current = grading ? effectivePoints(grading.content) : null;

      if (current !== null && current === incoming) {
        unchanged++;
        continue;
      }

      changes.push({
        submissionId: submission.id,
        studentName: student.name,
        questionId: question.id,
        questionNumber: question.number,
        label,
        maxPoints: question.max_points,
        current,
        incoming,
        fromBlank: mark === null,
        overMax: incoming > question.max_points,
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
    coveredSubmissions,
  };
}
