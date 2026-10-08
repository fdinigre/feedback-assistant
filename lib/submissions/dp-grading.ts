import "server-only";

// DP-typed read/write helpers for the `gradings` table. The table itself is
// shared with MYP (lib/db/queries.ts's `upsertGrading`/`listGradings`,
// typed to `GradingQuestion`) — the `content` column is a plain JSON TEXT
// blob, so storage doesn't care which shape it holds. These helpers give the
// DP review screen its own correctly-typed view of the same table without
// touching lib/db/queries.ts, lib/db/schema.sql, or lib/types.ts.

import { getDb } from "@/lib/db";
import { getAssessment, listQuestions, upsertDpResult } from "@/lib/db/queries";
import type { DpGradingQuestion, DpResultRow } from "@/lib/types";
import { buildMarkValueMap, pctOf, pickFinal, sumSubmissionMarks, computeDpGrade } from "./dp-calc";

export type DpGradingRow = {
  id: number;
  submission_id: number;
  question_id: number;
  content: DpGradingQuestion;
  created_at: string;
};

type RawDpGradingRow = Omit<DpGradingRow, "content"> & { content: string };

function mapDpGrading(row: RawDpGradingRow): DpGradingRow {
  return { ...row, content: JSON.parse(row.content) as DpGradingQuestion };
}

export function listDpGradings(submissionId: number): DpGradingRow[] {
  const rows = getDb()
    .prepare("SELECT * FROM gradings WHERE submission_id = ? ORDER BY question_id")
    .all(submissionId) as RawDpGradingRow[];
  return rows.map(mapDpGrading);
}

export function getDpGrading(submissionId: number, questionId: number): DpGradingRow | undefined {
  const row = getDb()
    .prepare("SELECT * FROM gradings WHERE submission_id = ? AND question_id = ?")
    .get(submissionId, questionId) as RawDpGradingRow | undefined;
  return row ? mapDpGrading(row) : undefined;
}

/** Insert or replace the DP grading for (submission, question). Mirrors
 * lib/db/queries.ts's upsertGrading exactly, just typed for DpGradingQuestion. */
export function upsertDpGrading(input: {
  submission_id: number;
  question_id: number;
  content: DpGradingQuestion;
}): DpGradingRow {
  getDb()
    .prepare(
      `INSERT INTO gradings (submission_id, question_id, content)
       VALUES (@submission_id, @question_id, @content)
       ON CONFLICT(submission_id, question_id) DO UPDATE SET content = excluded.content`
    )
    .run({
      submission_id: input.submission_id,
      question_id: input.question_id,
      content: JSON.stringify(input.content),
    });
  return getDpGrading(input.submission_id, input.question_id)!;
}

/**
 * Recomputes a submission's total/max/pct/grade from its current DP
 * gradings (using the teacher's final-override pass, falling back to the
 * conservative pass) and the assessment's grade boundaries, then persists it
 * to dp_results. grade_final always mirrors the freshly recomputed grade —
 * on this review screen there's no separate override step beyond the
 * per-mark toggles that feed straight into this recompute.
 */
export function recomputeAndPersistDpResult(assessmentId: number, submissionId: number): DpResultRow {
  const assessment = getAssessment(assessmentId);
  const boundaries = assessment?.boundaries ?? [];
  const questions = listQuestions(assessmentId);
  const gradingByQuestionId = new Map(
    listDpGradings(submissionId).map((g) => [g.question_id, g.content])
  );
  const { total, max } = sumSubmissionMarks(questions, gradingByQuestionId, pickFinal);
  const pct = pctOf(total, max);
  const grade = computeDpGrade(pct, boundaries);

  return upsertDpResult({
    submission_id: submissionId,
    total_marks: total,
    max_marks: max,
    pct,
    grade,
    grade_final: grade,
  });
}

// Re-export for convenience so callers only need one import in most cases.
export { buildMarkValueMap };
