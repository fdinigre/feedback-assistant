import "server-only";

import { getStudent, listGradings, listQuestions } from "@/lib/db/queries";
import type { AssessmentRow, SubmissionRow } from "@/lib/types";
import { questionsForStudent } from "./course";

export type TestScore = { earned: number; max: number };

/**
 * A points-only test's score for one submission: the marks earned over the
 * questions this student sat (a modified student skips "standard only" ones),
 * out of that same set's total. Null until something has been graded.
 */
export function testScore(assessment: AssessmentRow, submission: SubmissionRow): TestScore | null {
  const gradings = listGradings(submission.id);
  if (gradings.length === 0) return null;
  const student = submission.student_id !== null ? getStudent(submission.student_id) : undefined;
  const questions = questionsForStudent(listQuestions(assessment.id), student);
  const byQuestion = new Map(gradings.map((g) => [g.question_id, g]));
  let earned = 0;
  let max = 0;
  for (const q of questions) {
    max += q.max_points;
    const g = byQuestion.get(q.id);
    if (g) earned += g.content.finalPoints ?? g.content.conservativePoints;
  }
  return { earned, max };
}

/** "24/26", for headers and grade lines. */
export function formatTestScore(score: TestScore): string {
  return `${score.earned}/${score.max}`;
}
