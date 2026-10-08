import "server-only";

import { getLearningTarget, listGradings, listQuestions, listStudents } from "@/lib/db/queries";
import { listGradedSubmissions } from "@/lib/students/shared";
import { sumQuestionMarks, pickFinal } from "@/lib/submissions/dp-calc";
import type { DpGradingQuestion } from "@/lib/types";

export type MasteryRow = {
  learningTargetId: number;
  name: string;
  earned: number;
  max: number;
  pct: number; // 0-100
  questionCount: number;
  assessmentTitles: string[];
  /** Distinct students represented (class-level view only). */
  studentCount?: number;
};

type Acc = Map<
  number,
  {
    earned: number;
    max: number;
    questionCount: number;
    assessmentTitles: Set<string>;
    studentIds: Set<number>;
  }
>;

/** Adds one student's graded work into a shared learning-target accumulator. */
function accumulateStudent(studentId: number, acc: Acc): void {
  for (const { assessment, submission } of listGradedSubmissions(studentId)) {
    const questionById = new Map(listQuestions(assessment.id).map((q) => [q.id, q]));
    for (const grading of listGradings(submission.id)) {
      const question = questionById.get(grading.question_id);
      if (!question || question.learning_target_id == null) continue;

      const entry = acc.get(question.learning_target_id) ?? {
        earned: 0,
        max: 0,
        questionCount: 0,
        assessmentTitles: new Set<string>(),
        studentIds: new Set<number>(),
      };
      // DP gradings store sub-part awards (no finalPoints/proposedPoints) — read the
      // capped final total; MYP gradings default to the conservative pass. Fall back to
      // 0 so a missing field can never poison the sum with NaN.
      const content = grading.content as Record<string, unknown>;
      entry.earned += Array.isArray(content.subparts)
        ? sumQuestionMarks(grading.content as unknown as DpGradingQuestion, question.dp_scheme, pickFinal)
        : (content.finalPoints as number | null) ??
          (content.conservativePoints as number | undefined) ??
          (content.proposedPoints as number | undefined) ??
          0;
      entry.max += question.max_points;
      entry.questionCount += 1;
      entry.assessmentTitles.add(assessment.title);
      entry.studentIds.add(studentId);
      acc.set(question.learning_target_id, entry);
    }
  }
}

function buildRows(acc: Acc, includeStudentCount: boolean): MasteryRow[] {
  const rows: MasteryRow[] = [];
  for (const [learningTargetId, entry] of acc) {
    const target = getLearningTarget(learningTargetId);
    rows.push({
      learningTargetId,
      name: target?.name ?? `Target #${learningTargetId}`,
      earned: entry.earned,
      max: entry.max,
      pct: entry.max > 0 ? (entry.earned / entry.max) * 100 : 0,
      questionCount: entry.questionCount,
      assessmentTitles: [...entry.assessmentTitles],
      ...(includeStudentCount ? { studentCount: entry.studentIds.size } : {}),
    });
  }
  rows.sort((a, b) => a.pct - b.pct || a.name.localeCompare(b.name));
  return rows;
}

/** Learning-target mastery across every student in a class (weakest first). */
export function computeClassMastery(classId: number): MasteryRow[] {
  const acc: Acc = new Map();
  for (const student of listStudents(classId)) accumulateStudent(student.id, acc);
  return buildRows(acc, true);
}

/**
 * Learning-target mastery across ALL graded submissions of this student:
 * per learning target, sum(points earned)/sum(max points) over every
 * question tagged with it, regardless of which assessment it came from.
 * Sorted weakest first — this is the scannable core of the profile page.
 */
export function computeMastery(studentId: number): MasteryRow[] {
  const acc: Acc = new Map();
  accumulateStudent(studentId, acc);
  return buildRows(acc, false);
}
