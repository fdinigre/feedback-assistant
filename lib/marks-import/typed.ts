import "server-only";

import {
  deleteSheetMark,
  getMarksSheet,
  getStudent,
  listQuestions,
  listSheetMarksForAssessment,
  listSubmissions,
  upsertMarksSheet,
  upsertSheetMark,
} from "@/lib/db/queries";
import { questionsForStudent } from "@/lib/assessment/course";
import type { AssessmentRow, QuestionRow } from "@/lib/types";
import { currentMark } from "./diff";
import { sheetQuestionLabel } from "./labels";
import { settleIfSheetAgrees } from "./pending";

/**
 * Marks typed straight into a table, as the alternative to uploading a spreadsheet.
 * They are compared exactly as a sheet's marks are: a typed mark that differs from
 * the app's is kept as a difference to settle; one that agrees needs no record.
 * Typing changes no mark.
 */

export type TypedColumn = { key: string; questionId: number; part: string; label: string; max: number };
export type TypedCell = {
  /** The teacher's mark, where she has typed one. */
  mine: number | null;
  /** What the app has now; null when it hasn't marked this question. */
  ai: number | null;
  /** False for a question this student does not sit (the other version of the test). */
  sits: boolean;
};
export type TypedRow = { submissionId: number; name: string; cells: Record<string, TypedCell> };
export type TypedGrid = { columns: TypedColumn[]; rows: TypedRow[] };
export type TypedMark = { submissionId: number; questionId: number; part: string; value: number | null };

export const cellKey = (questionId: number, part: string) => `${questionId}:${part}`;

/** A column per question; on a Diploma paper, per part of a question where it has parts. */
function columnsFor(assessment: AssessmentRow, questions: QuestionRow[]): TypedColumn[] {
  const columns: TypedColumn[] = [];
  for (const q of questions) {
    const subparts = assessment.programme === "DP" ? (q.dp_scheme?.subparts ?? []) : [];
    if (subparts.length === 0) {
      columns.push({
        key: cellKey(q.id, ""),
        questionId: q.id,
        part: "",
        label: sheetQuestionLabel(q.number, ""),
        max: q.max_points,
      });
      continue;
    }
    for (const sp of subparts) {
      columns.push({
        key: cellKey(q.id, sp.label),
        questionId: q.id,
        part: sp.label,
        label: sheetQuestionLabel(q.number, sp.label),
        max: sp.maxMarks,
      });
    }
  }
  return columns;
}

/** Every student with a paper on this assessment, against every question they sit. */
export function buildTypedMarksGrid(assessment: AssessmentRow): TypedGrid {
  const questions = listQuestions(assessment.id);
  const columns = columnsFor(assessment, questions);
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const stored = new Map(
    listSheetMarksForAssessment(assessment.id).map((m) => [`${m.submission_id}:${cellKey(m.question_id, m.part)}`, m.points])
  );

  const rows: TypedRow[] = [];
  for (const submission of listSubmissions(assessment.id)) {
    if (submission.student_id === null || submission.status === "absent") continue;
    const student = getStudent(submission.student_id);
    if (!student) continue;
    const cells: Record<string, TypedCell> = {};
    for (const col of columns) {
      const question = questionById.get(col.questionId)!;
      const sits = questionsForStudent([question], student).length === 1;
      cells[col.key] = {
        mine: stored.get(`${submission.id}:${col.key}`) ?? null,
        ai: sits ? currentMark(assessment, question, col.part, submission.id) : null,
        sits,
      };
    }
    rows.push({ submissionId: submission.id, name: student.name, cells });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { columns, rows };
}

export type SaveTypedResult = { error: string | null; saved: number; differing: number; settled: number; touched: number[] };

/**
 * Stores the marks typed in. Each is checked against the paper and the question's
 * maximum before anything is written. An empty cell (value null) removes her mark.
 */
export function saveTypedMarks(assessment: AssessmentRow, marks: TypedMark[]): SaveTypedResult {
  const fail = (error: string): SaveTypedResult => ({ error, saved: 0, differing: 0, settled: 0, touched: [] });
  const grid = buildTypedMarksGrid(assessment);
  const column = new Map(grid.columns.map((c) => [c.key, c]));
  const row = new Map(grid.rows.map((r) => [r.submissionId, r]));

  for (const m of marks) {
    const r = row.get(m.submissionId);
    const col = column.get(cellKey(m.questionId, m.part));
    if (!r || !col) return fail("A mark did not match a paper or question on this assessment. Reload the page and try again.");
    if (!r.cells[col.key].sits) return fail(`${r.name} does not sit ${col.label}.`);
    if (m.value === null) continue;
    if (!Number.isFinite(m.value) || m.value < 0) return fail(`${r.name}, ${col.label}: a mark must be a number, zero or more.`);
    if (m.value > col.max) return fail(`${r.name}, ${col.label}: ${m.value} is above the maximum of ${col.max}.`);
  }

  const questionById = new Map(listQuestions(assessment.id).map((q) => [q.id, q]));
  let saved = 0;
  let differing = 0;
  for (const m of marks) {
    const question = questionById.get(m.questionId)!;
    if (m.value === null) {
      deleteSheetMark(m.submissionId, m.questionId, m.part);
      continue;
    }
    saved++;
    const current = currentMark(assessment, question, m.part, m.submissionId);
    if (current === m.value) {
      // Agreement needs no record: the comparison only keeps what differs.
      deleteSheetMark(m.submissionId, m.questionId, m.part);
    } else {
      differing++;
      upsertSheetMark({
        submission_id: m.submissionId,
        question_id: m.questionId,
        part: m.part,
        points: m.value,
        app_points: current,
      });
    }
  }

  // The panel that lists differences has a "sheet" to delete: make one if there is none.
  if (!getMarksSheet(assessment.id)) {
    upsertMarksSheet({
      assessment_id: assessment.id,
      file_name: "Marks typed in the app",
      summary: {
        unchanged: 0,
        unmatchedNames: [],
        unmatchedLabels: [],
        missingFromSheet: [],
        withoutSubmission: [],
        overMax: [],
        unmarked: 0,
      },
    });
  }

  // A paper whose every mark was typed and none is left to decide has been checked in full.
  const touched = [...new Set(marks.map((m) => m.submissionId))];
  let settled = 0;
  for (const submissionId of touched) {
    const r = row.get(submissionId)!;
    const sat = grid.columns.filter((c) => r.cells[c.key].sits);
    const typed = marks.filter((m) => m.submissionId === submissionId && m.value !== null);
    if (sat.length > 0 && typed.length === sat.length && settleIfSheetAgrees(assessment.id, submissionId, true)) settled++;
  }
  return { error: null, saved, differing, settled, touched };
}
