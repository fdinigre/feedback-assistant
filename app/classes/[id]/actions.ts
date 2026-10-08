"use server";

import { revalidatePath } from "next/cache";
import { PlanSheetError, parseYearPlan, type SkippedRow } from "@/lib/plan/parse";
import {
  deleteClassPlan,
  deleteStudent,
  getClass,
  getStudent,
  insertStudent,
  listStudents,
  replaceClassPlan,
  upsertExternalData,
} from "@/lib/db/queries";
import type { ExternalDataSource, StudentRow } from "@/lib/types";
import { parseNameList } from "@/lib/roster/names";
import { parseDelimitedTableAuto, stripBlankDataRows, type CsvTable } from "@/lib/roster/csv";
import { parseXlsxTable } from "@/lib/roster/xlsx";
import { findNameColumn, matchRowsToRoster } from "@/lib/roster/match";

/**
 * Revalidates every route whose content depends on a class roster: the class
 * page itself, the Classes list (student counts) and the dashboard (class
 * strip). Missing the last two is why a freshly-added roster kept showing
 * "0 students".
 */
function revalidateRoster(classId: number): void {
  revalidatePath(`/classes/${classId}`);
  revalidatePath("/classes");
  revalidatePath("/");
}

export type StudentFormState = { error: string | null };

export async function addStudentAction(
  classId: number,
  _prevState: StudentFormState,
  formData: FormData
): Promise<StudentFormState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Student name is required." };
  insertStudent({ class_id: classId, name });
  revalidateRoster(classId);
  return { error: null };
}

/**
 * Removes a student from the roster. A student with work on file can be removed
 * too — `deleteStudent` cascades through their submissions, transcripts,
 * gradings, levels, reports, DP results, imported data and IA records. The
 * button spells out that footprint in its confirmation before this ever runs,
 * so the destructive case is an informed choice rather than a silent one.
 */
export async function removeStudentAction(
  _prevState: StudentFormState,
  formData: FormData
): Promise<StudentFormState> {
  const studentId = Number(formData.get("studentId"));
  const student = getStudent(studentId);
  if (!student) return { error: "Student not found." };
  deleteStudent(studentId);
  revalidateRoster(student.class_id);
  return { error: null };
}

// ---------------------------------------------------------------------------
// Bulk add students (paste / upload, preview before insert)
// ---------------------------------------------------------------------------

export type BulkAddDirectResult = { error: string | null; added: number; skipped: number };

/**
 * One-step bulk add: parse the pasted/uploaded names, skip any already in the
 * roster (and any duplicated within the list itself), insert the rest. Returns
 * how many were added and how many were skipped so the UI can report both.
 */
export async function bulkAddDirectAction(
  classId: number,
  raw: string
): Promise<BulkAddDirectResult> {
  const names = parseNameList(raw);
  if (names.length === 0) {
    return {
      error: "No names found — paste one name per line, or a CSV with a Name column.",
      added: 0,
      skipped: 0,
    };
  }
  const existing = new Set(listStudents(classId).map((s) => s.name.trim().toLowerCase()));
  const seen = new Set<string>();
  let added = 0;
  let skipped = 0;
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (existing.has(key) || seen.has(key)) {
      skipped++;
      continue;
    }
    insertStudent({ class_id: classId, name: trimmed });
    seen.add(key);
    added++;
  }
  revalidateRoster(classId);
  return { error: null, added, skipped };
}

// ---------------------------------------------------------------------------
// External data import (MAP / CAT4) — preview + confirm
// ---------------------------------------------------------------------------

export type ExternalImportRow = { rowIndex: number; data: Record<string, string> };

export type ExternalImportPreviewData = {
  source: ExternalDataSource;
  headers: string[];
  nameColumn: string;
  rows: ExternalImportRow[];
  matched: { rowIndex: number; studentId: number; studentName: string }[];
  unmatched: { rowIndex: number; nameValue: string }[];
  blankSkipped: number;
};

export type ExternalImportPreview =
  | { error: string; preview?: undefined }
  | { error: null; preview: ExternalImportPreviewData };

/** File payload accepted by the import flow: plain delimited text (paste, .csv, .tsv) or a binary .xlsx workbook. */
export type ImportFilePayload =
  | { kind: "text"; text: string }
  | { kind: "xlsx"; base64: string };

async function parseImportPayload(payload: ImportFilePayload): Promise<CsvTable> {
  if (payload.kind === "xlsx") {
    const buffer = Buffer.from(payload.base64, "base64");
    return parseXlsxTable(buffer);
  }
  return parseDelimitedTableAuto(payload.text);
}

export async function previewExternalImportAction(
  classId: number,
  source: ExternalDataSource,
  payload: ImportFilePayload
): Promise<ExternalImportPreview> {
  if (payload.kind === "text" && !payload.text.trim()) {
    return { error: "No data provided." };
  }

  let table: CsvTable;
  try {
    table = await parseImportPayload(payload);
  } catch {
    return { error: "Could not read the uploaded file. Is it a valid .xlsx workbook?" };
  }
  if (table.headers.length === 0) return { error: "Could not find any columns in the file." };

  const nameColumn = findNameColumn(table.headers, table.rows);
  if (!nameColumn) return { error: "Could not find any columns in the file." };

  const { table: withoutBlanks, blankSkipped } = stripBlankDataRows(table, nameColumn);
  if (withoutBlanks.rows.length === 0) {
    return {
      error:
        blankSkipped > 0
          ? `All ${blankSkipped} data row(s) were blank (no data besides the name) — nothing to import.`
          : "The file has no data rows.",
    };
  }

  const students = listStudents(classId);
  const { matched, unmatched } = matchRowsToRoster(withoutBlanks.rows, nameColumn, students);
  const studentById = new Map(students.map((s) => [s.id, s] as [number, StudentRow]));

  const rows: ExternalImportRow[] = withoutBlanks.rows.map((data, rowIndex) => ({
    rowIndex,
    data,
  }));

  return {
    error: null,
    preview: {
      source,
      headers: withoutBlanks.headers,
      nameColumn,
      rows,
      matched: matched.map((m) => ({
        rowIndex: m.rowIndex,
        studentId: m.studentId,
        studentName: studentById.get(m.studentId)?.name ?? "",
      })),
      unmatched: unmatched.map((u) => ({
        rowIndex: u.rowIndex,
        nameValue: withoutBlanks.rows[u.rowIndex][nameColumn] ?? "",
      })),
      blankSkipped,
    },
  };
}

/** A column's value, matched on the header's words rather than its exact spelling. */
function column(data: Record<string, string>, pattern: RegExp): string | null {
  for (const [key, value] of Object.entries(data)) {
    if (pattern.test(key)) return String(value ?? "").trim() || null;
  }
  return null;
}

/**
 * Which record within its source a row is. Prior grades are kept per semester, so
 * importing semester 2 sits beside semester 1 instead of replacing it; every other
 * source holds one current record, which is what a re-import replaces.
 *
 * Formatted so it sorts chronologically as plain text: "2025-26 S1" then "2025-26 S2".
 * A row that names neither gets no period and behaves exactly as before.
 */
function periodOf(source: ExternalDataSource, data: Record<string, string>): string | null {
  if (source !== "PRIOR_GRADES") return null;
  const year = column(data, /school\s*year|^year$/i);
  const semester = column(data, /semester|^sem$/i);
  if (!year && !semester) return null;
  const semesterLabel = semester ? `S${semester.replace(/[^0-9]/g, "") || semester}` : null;
  return [year, semesterLabel].filter(Boolean).join(" ");
}

export type ConfirmImportResult = { error: string | null; imported: number };

/** `assignments` maps a row index to either a student id or "skip". */
export async function confirmExternalImportAction(
  classId: number,
  source: ExternalDataSource,
  nameColumn: string,
  rows: ExternalImportRow[],
  assignments: Record<number, number | "skip">
): Promise<ConfirmImportResult> {
  let imported = 0;
  for (const row of rows) {
    const assignment = assignments[row.rowIndex];
    if (assignment === undefined || assignment === "skip") continue;
    // The name column is redundant once matched to a student_id, and keeping
    // it out of the stored JSON keeps the student's real name out of any
    // downstream AI prompt built from external_data (see lib/pipeline/report.ts).
    const data = { ...row.data };
    delete data[nameColumn];
    upsertExternalData({ student_id: assignment, source, data, period: periodOf(source, data) });
    imported++;
  }
  revalidateRoster(classId);
  return { error: null, imported };
}

// ---------------------------------------------------------------------------
// year plan (the class's daily plan for the year)
// ---------------------------------------------------------------------------

export type YearPlanSummary = {
  fileName: string;
  sheetName: string;
  startYear: number;
  /** True when every date in the file carried its own year, so nothing was inferred. */
  yearFromFile: boolean;
  lessons: number;
  breaks: number;
  assessments: number;
  firstDate: string | null;
  lastDate: string | null;
  skipped: SkippedRow[];
  undated: { row: number; text: string }[];
  sample: { date: string; endDate: string | null; kind: string; topic: string }[];
};

export type YearPlanPreviewResult = { error: string | null; summary?: YearPlanSummary };

async function readPlan(base64: string, fileName: string, startYear?: number) {
  return parseYearPlan(Buffer.from(base64, "base64"), { fileName, startYear });
}

/**
 * Reads an uploaded planner and describes what it found, without saving anything.
 * The teacher confirms the span before it is kept, because a file whose dates
 * carry no year has to be anchored to one and getting that wrong would shift
 * everything silently.
 */
export async function previewYearPlanAction(
  classId: number,
  fileName: string,
  base64: string,
  startYear?: number
): Promise<YearPlanPreviewResult> {
  if (!getClass(classId)) return { error: "That class no longer exists." };
  try {
    const plan = await readPlan(base64, fileName, startYear);
    if (plan.entries.length === 0) {
      return { error: "No dated lessons could be read from that file." };
    }
    const lessons = plan.entries.filter((e) => e.kind === "lesson");
    return {
      error: null,
      summary: {
        fileName,
        sheetName: plan.sheetName,
        startYear: plan.startYear,
        yearFromFile: plan.yearFromFile,
        lessons: lessons.length,
        breaks: plan.entries.length - lessons.length,
        assessments: lessons.filter((e) => e.criteria.length > 0).length,
        firstDate: plan.entries[0]?.date ?? null,
        lastDate:
          plan.entries[plan.entries.length - 1]?.endDate ??
          plan.entries[plan.entries.length - 1]?.date ??
          null,
        skipped: plan.skipped,
        undated: plan.undated,
        sample: plan.entries.slice(0, 6).map((e) => ({
          date: e.date,
          endDate: e.endDate,
          kind: e.kind,
          topic: e.topic,
        })),
      },
    };
  } catch (err) {
    return { error: err instanceof PlanSheetError ? err.message : "That file could not be read." };
  }
}

/**
 * Saves the plan. The file is sent again and re-parsed rather than round-tripping
 * ninety rows back through the browser: the parse is pure, and nothing between
 * the preview and here is editable.
 */
export async function confirmYearPlanAction(
  classId: number,
  fileName: string,
  base64: string,
  startYear: number
): Promise<{ error: string | null; entries?: number }> {
  if (!getClass(classId)) return { error: "That class no longer exists." };
  try {
    const plan = await readPlan(base64, fileName, startYear);
    if (plan.entries.length === 0) return { error: "No dated lessons could be read from that file." };
    replaceClassPlan(
      classId,
      { file_name: fileName.replace(/[\\/]/g, "").slice(0, 200) || "year plan", start_year: plan.startYear },
      plan.entries.map((e) => ({
        date: e.date,
        end_date: e.endDate,
        kind: e.kind,
        lesson_no: e.lessonNo,
        unit: e.unit,
        topic: e.topic,
        resources: e.resources,
        note: e.note,
        criteria: e.criteria,
      }))
    );
    revalidateRoster(classId);
    return { error: null, entries: plan.entries.length };
  } catch (err) {
    return { error: err instanceof PlanSheetError ? err.message : "That file could not be read." };
  }
}

export async function deleteYearPlanAction(classId: number): Promise<{ error: string | null }> {
  deleteClassPlan(classId);
  revalidateRoster(classId);
  return { error: null };
}
