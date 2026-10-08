import "server-only";

import { getDb } from "@/lib/db";
import type {
  AiRequestRow,
  AssessmentRow,
  ClassRow,
  Criterion,
  CriterionLevelRow,
  MarkingInstructionRow,
  MarkingInstructionScope,
  AssessmentType,
  Course,
  DpAssessmentType,
  QuestionVariant,
  DpQuestionScheme,
  DpResultRow,
  ExternalDataRow,
  ExternalDataSource,
  Grade,
  GradeBoundary,
  GradingQuestion,
  GradingRow,
  MarksSheetRow,
  MarksUploadSummary,
  SheetMarkRow,
  IaDeadlineRow,
  IaDocumentKind,
  IaDocumentRow,
  IaExplorationRow,
  IaMilestone,
  IaOutputKind,
  IaOutputRow,
  IaOutputStatus,
  IaProgressRow,
  LearningTargetRow,
  LevelThresholdRow,
  NameMask,
  Programme,
  QuestionRow,
  ReportRow,
  ReportSections,
  ClassPlanRow,
  ClassPlanEntryRow,
  RubricRow,
  RubricDescriptorRow,
  DescriptorCheckRow,
  StudentRow,
  StyleExampleKind,
  StyleExampleRow,
  SubmissionRow,
  SubmissionStatus,
  TranscriptQuestion,
  TranscriptRow,
  WorkedSolutionRow,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Raw row shapes as they come back from better-sqlite3 (JSON columns as TEXT)
// ---------------------------------------------------------------------------

type RawClassRow = ClassRow;
type RawStudentRow = Omit<StudentRow, "modified"> & { modified: number };
function mapStudent(row: RawStudentRow): StudentRow {
  return { ...row, modified: row.modified === 1 };
}
type RawExternalDataRow = Omit<ExternalDataRow, "data"> & { data: string };
type RawLearningTargetRow = LearningTargetRow;
type RawAssessmentRow = Omit<
  AssessmentRow,
  "criteria" | "name_mask" | "name_masks" | "boundaries" | "cover_targets"
> & {
  criteria: string;
  name_mask: string | null; // stores JSON: legacy single NameMask OR a NameMask[]
  boundaries: string | null;
  cover_targets: string | null;
};

/**
 * Parses the name_mask column, which historically held a single NameMask object
 * and now holds a NameMask[] (page 1 + optional later pages). Accepts either
 * shape so old rows keep working, and drops any malformed/empty rectangles.
 */
function parseNameMasks(raw: string | null): NameMask[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  const arr = Array.isArray(value) ? value : [value];
  const masks: NameMask[] = [];
  for (const m of arr) {
    if (!m || typeof m !== "object") continue;
    const r = m as Record<string, unknown>;
    const page = Number(r.page ?? 1);
    const x = Number(r.x);
    const y = Number(r.y);
    const w = Number(r.w);
    const h = Number(r.h);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) continue;
    masks.push({ page: Number.isFinite(page) && page >= 1 ? Math.round(page) : 1, x, y, w, h });
  }
  return masks;
}
type RawQuestionRow = Omit<QuestionRow, "dp_scheme"> & { dp_scheme: string | null };
type RawLevelThresholdRow = LevelThresholdRow;
type RawWorkedSolutionRow = WorkedSolutionRow;
type RawRubricRow = RubricRow;
type RawClassPlanRow = ClassPlanRow;
type RawClassPlanEntryRow = Omit<ClassPlanEntryRow, "criteria"> & { criteria: string };
type RawRubricDescriptorRow = RubricDescriptorRow;
type RawDescriptorCheckRow = DescriptorCheckRow;
type RawSubmissionRow = Omit<SubmissionRow, "scratch_pages" | "warnings"> & {
  scratch_pages: string | null;
  warnings: string | null;
};
type RawTranscriptRow = Omit<TranscriptRow, "content"> & { content: string };
type RawGradingRow = Omit<GradingRow, "content"> & { content: string };
type RawCriterionLevelRow = CriterionLevelRow;
type RawReportRow = Omit<ReportRow, "sections"> & { sections: string };
type RawStyleExampleRow = StyleExampleRow;
type RawAiRequestRow = AiRequestRow;
type RawDpResultRow = DpResultRow;
type RawIaDeadlineRow = IaDeadlineRow;
type RawIaExplorationRow = IaExplorationRow;
type RawIaProgressRow = IaProgressRow;
type RawIaDocumentRow = IaDocumentRow;
type RawIaOutputRow = Omit<IaOutputRow, "content"> & { content: string };

// ---------------------------------------------------------------------------
// Row mappers (parse JSON columns)
// ---------------------------------------------------------------------------

function mapExternalData(row: RawExternalDataRow): ExternalDataRow {
  return { ...row, data: JSON.parse(row.data) };
}

function mapAssessment(row: RawAssessmentRow): AssessmentRow {
  const masks = parseNameMasks(row.name_mask);
  return {
    ...row,
    criteria: JSON.parse(row.criteria) as Criterion[],
    name_masks: masks,
    name_mask: masks.find((m) => m.page === 1) ?? masks[0] ?? null,
    boundaries: row.boundaries ? (JSON.parse(row.boundaries) as GradeBoundary[]) : null,
    cover_targets: row.cover_targets ? (JSON.parse(row.cover_targets) as string[]) : null,
  };
}

function mapQuestion(row: RawQuestionRow): QuestionRow {
  return {
    ...row,
    dp_scheme: row.dp_scheme ? (JSON.parse(row.dp_scheme) as DpQuestionScheme) : null,
  };
}

function mapIaOutput(row: RawIaOutputRow): IaOutputRow {
  return { ...row, content: JSON.parse(row.content) };
}

function mapSubmission(row: RawSubmissionRow): SubmissionRow {
  return {
    ...row,
    scratch_pages: row.scratch_pages ? (JSON.parse(row.scratch_pages) as number[]) : null,
    warnings: row.warnings ? (JSON.parse(row.warnings) as string[]) : null,
  };
}

function mapClassPlanEntry(row: RawClassPlanEntryRow): ClassPlanEntryRow {
  return { ...row, criteria: JSON.parse(row.criteria) as ClassPlanEntryRow["criteria"] };
}

function mapTranscript(row: RawTranscriptRow): TranscriptRow {
  return { ...row, content: JSON.parse(row.content) as TranscriptQuestion };
}

function mapGrading(row: RawGradingRow): GradingRow {
  return { ...row, content: JSON.parse(row.content) as GradingQuestion };
}

function mapReport(row: RawReportRow): ReportRow {
  return { ...row, sections: JSON.parse(row.sections) as ReportSections };
}

// ---------------------------------------------------------------------------
// Pseudonym generation ("S-XXXX", random, unique per students table)
// ---------------------------------------------------------------------------

function generatePseudonym(): string {
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM students WHERE pseudonym = ?");
  let candidate: string;
  do {
    const digits = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0");
    candidate = `S-${digits}`;
  } while (exists.get(candidate));
  return candidate;
}

// ---------------------------------------------------------------------------
// classes
// ---------------------------------------------------------------------------

export function listClasses(): ClassRow[] {
  return getDb().prepare("SELECT * FROM classes ORDER BY grade, name").all() as RawClassRow[];
}

export function getClass(id: number): ClassRow | undefined {
  return getDb().prepare("SELECT * FROM classes WHERE id = ?").get(id) as
    | RawClassRow
    | undefined;
}

export function getClassesByProgramme(programme: Programme): ClassRow[] {
  return getDb()
    .prepare("SELECT * FROM classes WHERE programme = ? ORDER BY grade, name")
    .all(programme) as RawClassRow[];
}

export function insertClass(input: {
  name: string;
  grade: Grade;
  programme?: Programme;
  dp_year?: 1 | 2 | null;
  course?: Course | null;
}): ClassRow {
  const result = getDb()
    .prepare(
      "INSERT INTO classes (name, grade, programme, dp_year, course) VALUES (@name, @grade, @programme, @dp_year, @course)"
    )
    .run({
      name: input.name,
      grade: input.grade,
      programme: input.programme ?? "MYP",
      dp_year: input.dp_year ?? null,
      course: input.course ?? null,
    });
  return getClass(result.lastInsertRowid as number)!;
}

export function updateClass(
  id: number,
  patch: Partial<{
    name: string;
    grade: Grade;
    programme: Programme;
    dp_year: 1 | 2 | null;
    course: Course | null;
  }>
): ClassRow | undefined {
  const current = getClass(id);
  if (!current) return undefined;
  const next = { ...current, ...patch };
  getDb()
    .prepare(
      "UPDATE classes SET name = @name, grade = @grade, programme = @programme, dp_year = @dp_year, course = @course WHERE id = @id"
    )
    .run({
      id,
      name: next.name,
      grade: next.grade,
      programme: next.programme,
      dp_year: next.dp_year,
      course: next.course,
    });
  return getClass(id);
}

export function deleteClass(id: number): void {
  getDb().prepare("DELETE FROM classes WHERE id = ?").run(id);
}

/** Counts of dependent data under a class, for an informed delete confirmation. */
export function getClassDataFootprint(id: number): {
  students: number;
  submissions: number;
  reports: number;
} {
  const db = getDb();
  const students = (
    db.prepare("SELECT count(*) AS n FROM students WHERE class_id = ?").get(id) as { n: number }
  ).n;
  const submissions = (
    db
      .prepare(
        "SELECT count(*) AS n FROM submissions sub JOIN students s ON sub.student_id = s.id WHERE s.class_id = ?"
      )
      .get(id) as { n: number }
  ).n;
  const reports = (
    db
      .prepare(
        "SELECT count(*) AS n FROM reports r JOIN submissions sub ON r.submission_id = sub.id JOIN students s ON sub.student_id = s.id WHERE s.class_id = ?"
      )
      .get(id) as { n: number }
  ).n;
  return { students, submissions, reports };
}

/**
 * Deletes a class and every row that hangs off it — its students and all their
 * submissions (transcripts, gradings, criterion levels, reports, DP results),
 * external data, and IA explorations (progress, documents, outputs) — plus the
 * class's IA deadlines and its assessments (questions, keys, marks sheets and
 * every submission under them). Runs in a single transaction so a failure leaves the DB
 * untouched. Irreversible: the caller must confirm first.
 */
export function deleteClassCascade(id: number): void {
  const db = getDb();
  const run = db.transaction((classId: number) => {
    const students = db
      .prepare("SELECT id FROM students WHERE class_id = ?")
      .all(classId) as { id: number }[];
    const studentIds = students.map((s) => s.id);

    for (const sid of studentIds) {
      const subs = db
        .prepare("SELECT id FROM submissions WHERE student_id = ?")
        .all(sid) as { id: number }[];
      for (const sub of subs) {
        db.prepare("DELETE FROM transcripts WHERE submission_id = ?").run(sub.id);
        db.prepare("DELETE FROM gradings WHERE submission_id = ?").run(sub.id);
        db.prepare("DELETE FROM criterion_levels WHERE submission_id = ?").run(sub.id);
        db.prepare("DELETE FROM reports WHERE submission_id = ?").run(sub.id);
        db.prepare("DELETE FROM dp_results WHERE submission_id = ?").run(sub.id);
      }
      db.prepare("DELETE FROM submissions WHERE student_id = ?").run(sid);
      db.prepare("DELETE FROM external_data WHERE student_id = ?").run(sid);

      const exps = db
        .prepare("SELECT id FROM ia_explorations WHERE student_id = ?")
        .all(sid) as { id: number }[];
      for (const exp of exps) {
        db.prepare("DELETE FROM ia_progress WHERE exploration_id = ?").run(exp.id);
        db.prepare("DELETE FROM ia_documents WHERE exploration_id = ?").run(exp.id);
        db.prepare("DELETE FROM ia_outputs WHERE exploration_id = ?").run(exp.id);
      }
      db.prepare("DELETE FROM ia_explorations WHERE student_id = ?").run(sid);
    }

    // The class's assessments, with every question, key, threshold, rubric,
    // marks sheet and submission under them (unassigned scans included).
    const assessments = db
      .prepare("SELECT id FROM assessments WHERE class_id = ?")
      .all(classId) as { id: number }[];
    for (const a of assessments) deleteAssessmentRows(a.id);

    db.prepare("DELETE FROM ia_deadlines WHERE class_id = ?").run(classId);
    db.prepare("DELETE FROM class_plan_entries WHERE class_id = ?").run(classId);
    db.prepare("DELETE FROM class_plans WHERE class_id = ?").run(classId);
    db.prepare(
      "DELETE FROM student_aliases WHERE student_id IN (SELECT id FROM students WHERE class_id = ?)"
    ).run(classId);
    db.prepare("DELETE FROM students WHERE class_id = ?").run(classId);
    db.prepare("DELETE FROM classes WHERE id = ?").run(classId);
  });
  run(id);
}

/**
 * Deletes an assessment and every row under it — questions, key, thresholds,
 * rubrics, marks sheets and each submission's transcript, grading, levels and
 * report. One transaction; irreversible, so the caller confirms first. Files on
 * disk (paper, uploads, page images) are the caller's to remove.
 */
export function deleteAssessmentCascade(assessmentId: number): void {
  getDb().transaction(() => deleteAssessmentRows(assessmentId))();
}

/** Every row that hangs off one assessment, then the assessment itself. Runs inside the caller's transaction. */
function deleteAssessmentRows(assessmentId: number): void {
  const db = getDb();
  const subs = db
    .prepare("SELECT id FROM submissions WHERE assessment_id = ?")
    .all(assessmentId) as { id: number }[];
  for (const sub of subs) {
    db.prepare("DELETE FROM sheet_marks WHERE submission_id = ?").run(sub.id);
    db.prepare("DELETE FROM descriptor_checks WHERE submission_id = ?").run(sub.id);
    db.prepare("DELETE FROM transcripts WHERE submission_id = ?").run(sub.id);
    db.prepare("DELETE FROM gradings WHERE submission_id = ?").run(sub.id);
    db.prepare("DELETE FROM criterion_levels WHERE submission_id = ?").run(sub.id);
    db.prepare("DELETE FROM reports WHERE submission_id = ?").run(sub.id);
    db.prepare("DELETE FROM dp_results WHERE submission_id = ?").run(sub.id);
    db.prepare("DELETE FROM question_error_tags WHERE submission_id = ?").run(sub.id);
    db.prepare("DELETE FROM question_skill_tags WHERE submission_id = ?").run(sub.id);
  }
  db.prepare("DELETE FROM submissions WHERE assessment_id = ?").run(assessmentId);
  db.prepare("DELETE FROM marks_sheets WHERE assessment_id = ?").run(assessmentId);
  db.prepare("DELETE FROM marking_instructions WHERE assessment_id = ?").run(assessmentId);
  db.prepare("DELETE FROM rubrics WHERE assessment_id = ?").run(assessmentId);
  db.prepare("DELETE FROM rubric_descriptors WHERE assessment_id = ?").run(assessmentId);
  db.prepare("DELETE FROM level_thresholds WHERE assessment_id = ?").run(assessmentId);
  db.prepare("DELETE FROM worked_solutions WHERE assessment_id = ?").run(assessmentId);
  db.prepare("DELETE FROM questions WHERE assessment_id = ?").run(assessmentId);
  db.prepare("DELETE FROM assessments WHERE id = ?").run(assessmentId);
}

// ---------------------------------------------------------------------------
// class_plans / class_plan_entries (the year plan a class follows)
// ---------------------------------------------------------------------------

export function getClassPlan(classId: number): ClassPlanRow | undefined {
  return getDb().prepare("SELECT * FROM class_plans WHERE class_id = ?").get(classId) as
    | RawClassPlanRow
    | undefined;
}

/** A class's plan in date order; `from` keeps only what is still ahead of that ISO date. */
export function listClassPlanEntries(classId: number, from?: string): ClassPlanEntryRow[] {
  const db = getDb();
  const rows = from
    ? db
        .prepare(
          `SELECT * FROM class_plan_entries
            WHERE class_id = ? AND coalesce(end_date, date) >= ?
            ORDER BY date, id`
        )
        .all(classId, from)
    : db
        .prepare("SELECT * FROM class_plan_entries WHERE class_id = ? ORDER BY date, id")
        .all(classId);
  return (rows as RawClassPlanEntryRow[]).map(mapClassPlanEntry);
}

/** What a class page needs to describe the plan it holds, without reading every row. */
export function getClassPlanSummary(
  classId: number
): { entries: number; lessons: number; breaks: number; firstDate: string | null; lastDate: string | null } {
  const row = getDb()
    .prepare(
      `SELECT count(*) AS entries,
              sum(kind = 'lesson') AS lessons,
              sum(kind = 'break') AS breaks,
              min(date) AS firstDate,
              max(coalesce(end_date, date)) AS lastDate
         FROM class_plan_entries WHERE class_id = ?`
    )
    .get(classId) as {
    entries: number;
    lessons: number | null;
    breaks: number | null;
    firstDate: string | null;
    lastDate: string | null;
  };
  return {
    entries: row.entries,
    lessons: row.lessons ?? 0,
    breaks: row.breaks ?? 0,
    firstDate: row.firstDate,
    lastDate: row.lastDate,
  };
}

export type ClassPlanEntryInput = Omit<ClassPlanEntryRow, "id" | "class_id" | "created_at">;

/**
 * Replaces a class's whole plan in one transaction — re-uploading a corrected
 * spreadsheet must leave the old rows behind, never accumulate on top of them.
 */
export function replaceClassPlan(
  classId: number,
  meta: { file_name: string; start_year: number },
  entries: ClassPlanEntryInput[]
): void {
  const db = getDb();
  const run = db.transaction(() => {
    db.prepare("DELETE FROM class_plan_entries WHERE class_id = ?").run(classId);
    const insert = db.prepare(
      `INSERT INTO class_plan_entries
         (class_id, date, end_date, kind, lesson_no, unit, topic, resources, note, criteria)
       VALUES (@class_id, @date, @end_date, @kind, @lesson_no, @unit, @topic, @resources, @note, @criteria)`
    );
    for (const entry of entries) {
      insert.run({ ...entry, class_id: classId, criteria: JSON.stringify(entry.criteria) });
    }
    db.prepare(
      `INSERT INTO class_plans (class_id, file_name, start_year, uploaded_at)
       VALUES (@class_id, @file_name, @start_year, datetime('now'))
       ON CONFLICT(class_id) DO UPDATE SET
         file_name = excluded.file_name,
         start_year = excluded.start_year,
         uploaded_at = excluded.uploaded_at`
    ).run({ ...meta, class_id: classId });
  });
  run();
}

export function deleteClassPlan(classId: number): void {
  const db = getDb();
  const run = db.transaction(() => {
    db.prepare("DELETE FROM class_plan_entries WHERE class_id = ?").run(classId);
    db.prepare("DELETE FROM class_plans WHERE class_id = ?").run(classId);
  });
  run();
}

// ---------------------------------------------------------------------------
// students
// ---------------------------------------------------------------------------

export function listStudents(classId?: number): StudentRow[] {
  const rows =
    classId !== undefined
      ? (getDb()
          .prepare("SELECT * FROM students WHERE class_id = ? ORDER BY name")
          .all(classId) as RawStudentRow[])
      : (getDb().prepare("SELECT * FROM students ORDER BY name").all() as RawStudentRow[]);
  return rows.map(mapStudent);
}

/** Counts of work hanging off a student, for an informed remove confirmation. */
export function getStudentDataFootprint(id: number): {
  submissions: number;
  reports: number;
  externalData: number;
} {
  const db = getDb();
  const one = (sql: string) => (db.prepare(sql).get(id) as { n: number }).n;
  return {
    submissions: one("SELECT count(*) AS n FROM submissions WHERE student_id = ?"),
    reports: one(
      "SELECT count(*) AS n FROM reports r JOIN submissions sub ON r.submission_id = sub.id WHERE sub.student_id = ?"
    ),
    externalData: one("SELECT count(*) AS n FROM external_data WHERE student_id = ?"),
  };
}

export function getStudent(id: number): StudentRow | undefined {
  const row = getDb().prepare("SELECT * FROM students WHERE id = ?").get(id) as
    | RawStudentRow
    | undefined;
  return row ? mapStudent(row) : undefined;
}

export function getStudentByPseudonym(pseudonym: string): StudentRow | undefined {
  const row = getDb().prepare("SELECT * FROM students WHERE pseudonym = ?").get(pseudonym) as
    | RawStudentRow
    | undefined;
  return row ? mapStudent(row) : undefined;
}

export function insertStudent(input: { class_id: number; name: string }): StudentRow {
  const pseudonym = generatePseudonym();
  const result = getDb()
    .prepare(
      "INSERT INTO students (class_id, name, pseudonym) VALUES (@class_id, @name, @pseudonym)"
    )
    .run({ ...input, pseudonym });
  return getStudent(result.lastInsertRowid as number)!;
}

export function updateStudent(
  id: number,
  patch: Partial<{ class_id: number; name: string; modified: boolean }>
): StudentRow | undefined {
  const current = getStudent(id);
  if (!current) return undefined;
  const next = { ...current, ...patch };
  getDb()
    .prepare(
      "UPDATE students SET class_id = @class_id, name = @name, modified = @modified WHERE id = @id"
    )
    .run({ id, class_id: next.class_id, name: next.name, modified: next.modified ? 1 : 0 });
  return getStudent(id);
}

/**
 * Removes a student and the rows that hang off them — imported external data
 * (MAP/CAT4/prior grades/ATL), IA explorations (progress, documents, outputs),
 * and any submissions with their transcripts/gradings/levels/reports/DP results.
 * Runs in one transaction so a partial delete can't leave a foreign-key orphan
 * (the plain "DELETE FROM students" alone fails when external_data references it).
 */
export function deleteStudent(id: number): void {
  const db = getDb();
  const run = db.transaction((studentId: number) => {
    const subs = db
      .prepare("SELECT id FROM submissions WHERE student_id = ?")
      .all(studentId) as { id: number }[];
    for (const sub of subs) {
      db.prepare("DELETE FROM transcripts WHERE submission_id = ?").run(sub.id);
      db.prepare("DELETE FROM gradings WHERE submission_id = ?").run(sub.id);
      db.prepare("DELETE FROM criterion_levels WHERE submission_id = ?").run(sub.id);
      db.prepare("DELETE FROM reports WHERE submission_id = ?").run(sub.id);
      db.prepare("DELETE FROM dp_results WHERE submission_id = ?").run(sub.id);
    }
    db.prepare("DELETE FROM submissions WHERE student_id = ?").run(studentId);
    db.prepare("DELETE FROM external_data WHERE student_id = ?").run(studentId);

    const exps = db
      .prepare("SELECT id FROM ia_explorations WHERE student_id = ?")
      .all(studentId) as { id: number }[];
    for (const exp of exps) {
      db.prepare("DELETE FROM ia_progress WHERE exploration_id = ?").run(exp.id);
      db.prepare("DELETE FROM ia_documents WHERE exploration_id = ?").run(exp.id);
      db.prepare("DELETE FROM ia_outputs WHERE exploration_id = ?").run(exp.id);
    }
    db.prepare("DELETE FROM ia_explorations WHERE student_id = ?").run(studentId);

    db.prepare("DELETE FROM student_aliases WHERE student_id = ?").run(studentId);
    db.prepare("DELETE FROM students WHERE id = ?").run(studentId);
  });
  run(id);
}

// ---------------------------------------------------------------------------
// external_data (MAP / CAT4) — re-import replaces previous values per source
// ---------------------------------------------------------------------------

/** Removes a source's records; `period` narrows it to one of them. */
export function deleteExternalData(
  studentId: number,
  source: ExternalDataSource,
  period?: string | null
): void {
  const db = getDb();
  if (period === undefined) {
    db.prepare("DELETE FROM external_data WHERE student_id = ? AND source = ?").run(
      studentId,
      source
    );
    return;
  }
  db.prepare(
    "DELETE FROM external_data WHERE student_id = ? AND source = ? AND period IS ?"
  ).run(studentId, source, period);
}

export function listExternalData(studentId: number): ExternalDataRow[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM external_data WHERE student_id = ? ORDER BY period DESC, imported_at DESC"
    )
    .all(studentId) as RawExternalDataRow[];
  return rows.map(mapExternalData);
}

/**
 * The current record for a source: the latest period where a source keeps
 * several (prior grades by semester), else the most recently imported. SQLite
 * sorts NULLs last under DESC, so a dated record always wins over an undated one.
 */
export function getExternalDataBySource(
  studentId: number,
  source: ExternalDataSource
): ExternalDataRow | undefined {
  const row = getDb()
    .prepare(
      `SELECT * FROM external_data WHERE student_id = ? AND source = ?
        ORDER BY period DESC, imported_at DESC LIMIT 1`
    )
    .get(studentId, source) as RawExternalDataRow | undefined;
  return row ? mapExternalData(row) : undefined;
}

/** Every record a source holds for this student, newest first. */
export function listExternalDataBySource(
  studentId: number,
  source: ExternalDataSource
): ExternalDataRow[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM external_data WHERE student_id = ? AND source = ?
        ORDER BY period DESC, imported_at DESC`
    )
    .all(studentId, source) as RawExternalDataRow[];
  return rows.map(mapExternalData);
}

/** Re-import replaces any previous rows for this student+source (per spec requirement 2). */
export function upsertExternalData(input: {
  student_id: number;
  source: ExternalDataSource;
  data: unknown;
  /** Which record within the source this is; omit where a source holds one. */
  period?: string | null;
}): ExternalDataRow {
  const db = getDb();
  const insertAndReplace = db.transaction(() => {
    // Replace only the record being re-imported. Where a source keeps several —
    // prior grades, one per semester — importing the second must not wipe the
    // first; `IS` matches NULL to NULL, which is how the other sources behave.
    db.prepare(
      "DELETE FROM external_data WHERE student_id = ? AND source = ? AND period IS ?"
    ).run(input.student_id, input.source, input.period ?? null);
    return db
      .prepare(
        "INSERT INTO external_data (student_id, source, period, data) VALUES (@student_id, @source, @period, @data)"
      )
      .run({
        student_id: input.student_id,
        source: input.source,
        period: input.period ?? null,
        data: JSON.stringify(input.data),
      });
  });
  const result = insertAndReplace();
  const row = db
    .prepare("SELECT * FROM external_data WHERE id = ?")
    .get(result.lastInsertRowid as number) as RawExternalDataRow;
  return mapExternalData(row);
}

// ---------------------------------------------------------------------------
// learning_targets — shared catalog per grade
// ---------------------------------------------------------------------------

export function listLearningTargets(grade?: Grade): LearningTargetRow[] {
  if (grade !== undefined) {
    return getDb()
      .prepare("SELECT * FROM learning_targets WHERE grade = ? ORDER BY name")
      .all(grade) as RawLearningTargetRow[];
  }
  return getDb()
    .prepare("SELECT * FROM learning_targets ORDER BY grade, name")
    .all() as RawLearningTargetRow[];
}

export function getLearningTarget(id: number): LearningTargetRow | undefined {
  return getDb().prepare("SELECT * FROM learning_targets WHERE id = ?").get(id) as
    | RawLearningTargetRow
    | undefined;
}

export function insertLearningTarget(input: { grade: Grade; name: string }): LearningTargetRow {
  const result = getDb()
    .prepare("INSERT INTO learning_targets (grade, name) VALUES (@grade, @name)")
    .run(input);
  return getLearningTarget(result.lastInsertRowid as number)!;
}

/** Returns the existing target for (grade, name) or creates it — the catalog is shared/reusable. */
export function findOrCreateLearningTarget(input: { grade: Grade; name: string }): LearningTargetRow {
  const existing = getDb()
    .prepare("SELECT * FROM learning_targets WHERE grade = ? AND name = ?")
    .get(input.grade, input.name) as RawLearningTargetRow | undefined;
  if (existing) return existing;
  return insertLearningTarget(input);
}

// ---------------------------------------------------------------------------
// assessments
// ---------------------------------------------------------------------------

export function listAssessments(): AssessmentRow[] {
  const rows = getDb()
    .prepare("SELECT * FROM assessments ORDER BY created_at DESC")
    .all() as RawAssessmentRow[];
  return rows.map(mapAssessment);
}

export function getAssessment(id: number): AssessmentRow | undefined {
  const row = getDb().prepare("SELECT * FROM assessments WHERE id = ?").get(id) as
    | RawAssessmentRow
    | undefined;
  return row ? mapAssessment(row) : undefined;
}

export function insertAssessment(input: {
  title: string;
  class_id?: number | null;
  grade: Grade;
  criteria: Criterion[];
  date?: string | null;
  name_mask?: NameMask | null;
  status?: string;
  programme?: Programme;
  assessment_type?: AssessmentType | null;
  boundaries?: GradeBoundary[] | null;
  paper_file?: string | null;
  markscheme_file?: string | null;
  cover_targets?: string[] | null;
}): AssessmentRow {
  const result = getDb()
    .prepare(
      `INSERT INTO assessments (title, class_id, grade, criteria, date, name_mask, status,
       programme, assessment_type, boundaries, paper_file, markscheme_file, cover_targets)
       VALUES (@title, @class_id, @grade, @criteria, @date, @name_mask, @status,
       @programme, @assessment_type, @boundaries, @paper_file, @markscheme_file, @cover_targets)`
    )
    .run({
      title: input.title,
      class_id: input.class_id ?? null,
      grade: input.grade,
      criteria: JSON.stringify(input.criteria),
      date: input.date ?? null,
      name_mask: input.name_mask ? JSON.stringify(input.name_mask) : null,
      status: input.status ?? "setup",
      programme: input.programme ?? "MYP",
      assessment_type: input.assessment_type ?? null,
      boundaries: input.boundaries ? JSON.stringify(input.boundaries) : null,
      paper_file: input.paper_file ?? null,
      markscheme_file: input.markscheme_file ?? null,
      cover_targets: input.cover_targets ? JSON.stringify(input.cover_targets) : null,
    });
  return getAssessment(result.lastInsertRowid as number)!;
}

export function updateAssessment(
  id: number,
  patch: Partial<{
    title: string;
    class_id: number | null;
    grade: Grade;
    criteria: Criterion[];
    date: string | null;
    name_mask: NameMask | null;
    name_masks: NameMask[];
    status: string;
    programme: Programme;
    assessment_type: AssessmentType | null;
    boundaries: GradeBoundary[] | null;
    paper_file: string | null;
    markscheme_file: string | null;
    cover_targets: string[] | null;
  }>
): AssessmentRow | undefined {
  const current = getAssessment(id);
  if (!current) return undefined;
  const next = { ...current, ...patch };
  // The name_mask column stores the full NameMask[]. Prefer an explicit
  // name_masks patch; else a single name_mask patch; else keep what's stored —
  // so patching an unrelated field never drops a configured page-2 mask.
  const masksToWrite: NameMask[] =
    patch.name_masks !== undefined
      ? patch.name_masks
      : patch.name_mask !== undefined
        ? patch.name_mask
          ? [patch.name_mask]
          : []
        : current.name_masks;
  getDb()
    .prepare(
      `UPDATE assessments SET title = @title, class_id = @class_id, grade = @grade, criteria = @criteria,
       date = @date, name_mask = @name_mask, status = @status, programme = @programme,
       assessment_type = @assessment_type, boundaries = @boundaries, paper_file = @paper_file,
       markscheme_file = @markscheme_file, cover_targets = @cover_targets WHERE id = @id`
    )
    .run({
      id,
      title: next.title,
      class_id: next.class_id ?? null,
      grade: next.grade,
      criteria: JSON.stringify(next.criteria),
      date: next.date,
      name_mask: masksToWrite.length ? JSON.stringify(masksToWrite) : null,
      status: next.status,
      programme: next.programme,
      assessment_type: next.assessment_type,
      boundaries: next.boundaries ? JSON.stringify(next.boundaries) : null,
      paper_file: next.paper_file,
      markscheme_file: next.markscheme_file,
      cover_targets: next.cover_targets ? JSON.stringify(next.cover_targets) : null,
    });
  return getAssessment(id);
}

export function deleteAssessment(id: number): void {
  getDb().prepare("DELETE FROM assessments WHERE id = ?").run(id);
}

/**
 * Create a DP assessment (quiz or unit test). DP assessments carry no MYP
 * criteria (stored as []) and always programme='DP'; boundaries/paper/
 * markscheme/cover_targets are set here or filled in later during setup.
 */
export function createDpAssessment(input: {
  title: string;
  class_id?: number | null;
  grade: Grade;
  assessment_type: DpAssessmentType;
  date?: string | null;
  boundaries?: GradeBoundary[] | null;
  paper_file?: string | null;
  markscheme_file?: string | null;
  cover_targets?: string[] | null;
  status?: string;
}): AssessmentRow {
  return insertAssessment({
    title: input.title,
    class_id: input.class_id ?? null,
    grade: input.grade,
    criteria: [],
    date: input.date ?? null,
    status: input.status ?? "setup",
    programme: "DP",
    assessment_type: input.assessment_type,
    boundaries: input.boundaries ?? null,
    paper_file: input.paper_file ?? null,
    markscheme_file: input.markscheme_file ?? null,
    cover_targets: input.cover_targets ?? null,
  });
}

export function updateDpAssessment(
  id: number,
  patch: Partial<{
    title: string;
    grade: Grade;
    assessment_type: DpAssessmentType;
    date: string | null;
    boundaries: GradeBoundary[] | null;
    paper_file: string | null;
    markscheme_file: string | null;
    cover_targets: string[] | null;
    status: string;
  }>
): AssessmentRow | undefined {
  return updateAssessment(id, patch);
}

// ---------------------------------------------------------------------------
// questions
// ---------------------------------------------------------------------------

/**
 * Natural order (1, 2, 3, 4a, 4b, 5a, 5b, 6, ...) rather than insertion/id
 * order — sub-part questions (e.g. "4a", "4b") are often created after the
 * top-level ones and would otherwise sort to the end. CAST(number AS INTEGER)
 * groups by the leading numeric part; the plain `number` tiebreaker then
 * orders same-numbered sub-parts alphabetically (4a before 4b).
 */
export function listQuestions(assessmentId: number): QuestionRow[] {
  const rows = getDb()
    .prepare("SELECT * FROM questions WHERE assessment_id = ? ORDER BY id")
    .all(assessmentId) as RawQuestionRow[];
  return rows.map(mapQuestion).sort((a, b) => compareQuestionNumbers(a.number, b.number));
}

/**
 * Paper order for question numbers: plain numbers first ("1", "2", "10", "1a"),
 * then lettered sections in order ("B1", "B2", "C1"). Within a group the numeric
 * part is compared as a number so "10" follows "9", and any trailing part
 * ("a", "b") breaks ties.
 */
function compareQuestionNumbers(a: string, b: string): number {
  const ka = questionSortKey(a);
  const kb = questionSortKey(b);
  if (ka.prefix !== kb.prefix) return ka.prefix.localeCompare(kb.prefix);
  if (ka.num !== kb.num) return ka.num - kb.num;
  return ka.rest.localeCompare(kb.rest);
}

function questionSortKey(number: string): { prefix: string; num: number; rest: string } {
  const m = number.trim().match(/^([A-Za-z]*)\s*(\d*)(.*)$/);
  const prefix = (m?.[1] ?? "").toUpperCase();
  const digits = m?.[2] ?? "";
  return {
    prefix,
    num: digits === "" ? Number.MAX_SAFE_INTEGER : Number(digits),
    rest: (m?.[3] ?? "").toLowerCase(),
  };
}

export function getQuestion(id: number): QuestionRow | undefined {
  const row = getDb().prepare("SELECT * FROM questions WHERE id = ?").get(id) as
    | RawQuestionRow
    | undefined;
  return row ? mapQuestion(row) : undefined;
}

export function insertQuestion(input: {
  assessment_id: number;
  number: string;
  max_points: number;
  level_band: QuestionRow["level_band"];
  learning_target_id?: number | null;
  dp_scheme?: DpQuestionScheme | null;
  variant?: QuestionVariant | null;
}): QuestionRow {
  const result = getDb()
    .prepare(
      `INSERT INTO questions (assessment_id, number, max_points, level_band, learning_target_id, dp_scheme, variant)
       VALUES (@assessment_id, @number, @max_points, @level_band, @learning_target_id, @dp_scheme, @variant)`
    )
    .run({
      assessment_id: input.assessment_id,
      number: input.number,
      max_points: input.max_points,
      level_band: input.level_band,
      learning_target_id: input.learning_target_id ?? null,
      dp_scheme: input.dp_scheme ? JSON.stringify(input.dp_scheme) : null,
      variant: input.variant ?? null,
    });
  return getQuestion(result.lastInsertRowid as number)!;
}

export function updateQuestion(
  id: number,
  patch: Partial<{
    number: string;
    max_points: number;
    level_band: QuestionRow["level_band"];
    learning_target_id: number | null;
    dp_scheme: DpQuestionScheme | null;
    variant: QuestionVariant | null;
  }>
): QuestionRow | undefined {
  const current = getQuestion(id);
  if (!current) return undefined;
  const next = { ...current, ...patch };
  getDb()
    .prepare(
      `UPDATE questions SET number = @number, max_points = @max_points,
       level_band = @level_band, learning_target_id = @learning_target_id,
       dp_scheme = @dp_scheme, variant = @variant WHERE id = @id`
    )
    .run({
      id,
      number: next.number,
      max_points: next.max_points,
      level_band: next.level_band,
      learning_target_id: next.learning_target_id,
      dp_scheme: next.dp_scheme ? JSON.stringify(next.dp_scheme) : null,
      variant: next.variant,
    });
  return getQuestion(id);
}

export function deleteQuestion(id: number): void {
  getDb().prepare("DELETE FROM questions WHERE id = ?").run(id);
}

/** What a question deletion would destroy, for an informed confirmation. */
export function getQuestionDataFootprint(id: number): {
  transcripts: number;
  gradings: number;
  students: number;
} {
  const db = getDb();
  const one = (sql: string) => (db.prepare(sql).get(id) as { n: number }).n;
  return {
    transcripts: one("SELECT count(*) AS n FROM transcripts WHERE question_id = ?"),
    gradings: one("SELECT count(*) AS n FROM gradings WHERE question_id = ?"),
    students: one(
      `SELECT count(DISTINCT sub.student_id) AS n
         FROM gradings g JOIN submissions sub ON g.submission_id = sub.id
        WHERE g.question_id = ?`
    ),
  };
}

/**
 * Deletes a question and everything that points at it — each student's
 * transcript of their answer, the marks given for it, and any worked solution.
 * transcripts.question_id and gradings.question_id are NOT NULL with no cascade,
 * so a plain DELETE fails with a foreign-key error the moment any paper has been
 * transcribed. Runs in one transaction: a failure leaves the question intact
 * rather than half its marking removed.
 */
export function deleteQuestionCascade(id: number): void {
  const db = getDb();
  const run = db.transaction((questionId: number) => {
    db.prepare("DELETE FROM transcripts WHERE question_id = ?").run(questionId);
    db.prepare("DELETE FROM gradings WHERE question_id = ?").run(questionId);
    db.prepare("DELETE FROM worked_solutions WHERE question_id = ?").run(questionId);
    db.prepare("DELETE FROM questions WHERE id = ?").run(questionId);
  });
  run(id);
}

/** Convenience accessor for the DP mark scheme JSON on a question. */
export function getQuestionDpScheme(id: number): DpQuestionScheme | null {
  return getQuestion(id)?.dp_scheme ?? null;
}

/** Convenience setter for the DP mark scheme JSON on a question (setup editor). */
export function setQuestionDpScheme(
  id: number,
  scheme: DpQuestionScheme
): QuestionRow | undefined {
  return updateQuestion(id, { dp_scheme: scheme });
}

// ---------------------------------------------------------------------------
// level_thresholds
// ---------------------------------------------------------------------------

export function listLevelThresholds(assessmentId: number): LevelThresholdRow[] {
  return getDb()
    .prepare("SELECT * FROM level_thresholds WHERE assessment_id = ? ORDER BY level")
    .all(assessmentId) as RawLevelThresholdRow[];
}

export function getLevelThreshold(
  assessmentId: number,
  level: number
): LevelThresholdRow | undefined {
  return getDb()
    .prepare("SELECT * FROM level_thresholds WHERE assessment_id = ? AND level = ?")
    .get(assessmentId, level) as RawLevelThresholdRow | undefined;
}

/** Insert or replace the threshold for (assessment, level) — setup screens re-save the whole table. */
export function upsertLevelThreshold(input: {
  assessment_id: number;
  level: number;
  min_points: number;
}): LevelThresholdRow {
  getDb()
    .prepare(
      `INSERT INTO level_thresholds (assessment_id, level, min_points)
       VALUES (@assessment_id, @level, @min_points)
       ON CONFLICT(assessment_id, level) DO UPDATE SET min_points = excluded.min_points`
    )
    .run(input);
  return getLevelThreshold(input.assessment_id, input.level)!;
}

export function deleteLevelThreshold(id: number): void {
  getDb().prepare("DELETE FROM level_thresholds WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------
// worked_solutions
// ---------------------------------------------------------------------------

export function listWorkedSolutions(assessmentId: number): WorkedSolutionRow[] {
  return getDb()
    .prepare("SELECT * FROM worked_solutions WHERE assessment_id = ? ORDER BY id")
    .all(assessmentId) as RawWorkedSolutionRow[];
}

export function getWorkedSolution(id: number): WorkedSolutionRow | undefined {
  return getDb().prepare("SELECT * FROM worked_solutions WHERE id = ?").get(id) as
    | RawWorkedSolutionRow
    | undefined;
}

export function insertWorkedSolution(input: {
  assessment_id: number;
  question_id?: number | null;
  content: string;
}): WorkedSolutionRow {
  const result = getDb()
    .prepare(
      `INSERT INTO worked_solutions (assessment_id, question_id, content)
       VALUES (@assessment_id, @question_id, @content)`
    )
    .run({ ...input, question_id: input.question_id ?? null });
  return getWorkedSolution(result.lastInsertRowid as number)!;
}

export function updateWorkedSolution(id: number, content: string): WorkedSolutionRow | undefined {
  getDb().prepare("UPDATE worked_solutions SET content = @content WHERE id = @id").run({
    id,
    content,
  });
  return getWorkedSolution(id);
}

export function deleteWorkedSolution(id: number): void {
  getDb().prepare("DELETE FROM worked_solutions WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------
// rubrics (task-specific, criteria B/C/D)
// ---------------------------------------------------------------------------

export function listRubrics(assessmentId: number): RubricRow[] {
  return getDb()
    .prepare("SELECT * FROM rubrics WHERE assessment_id = ? ORDER BY criterion")
    .all(assessmentId) as RawRubricRow[];
}

export function getRubric(assessmentId: number, criterion: string): RubricRow | undefined {
  return getDb()
    .prepare("SELECT * FROM rubrics WHERE assessment_id = ? AND criterion = ?")
    .get(assessmentId, criterion) as RawRubricRow | undefined;
}

export function insertRubric(input: {
  assessment_id: number;
  criterion: string;
  content: string;
}): RubricRow {
  const result = getDb()
    .prepare(
      "INSERT INTO rubrics (assessment_id, criterion, content) VALUES (@assessment_id, @criterion, @content)"
    )
    .run(input);
  return getDb()
    .prepare("SELECT * FROM rubrics WHERE id = ?")
    .get(result.lastInsertRowid as number) as RawRubricRow;
}

export function updateRubric(id: number, content: string): RubricRow | undefined {
  getDb().prepare("UPDATE rubrics SET content = @content WHERE id = @id").run({ id, content });
  return getDb().prepare("SELECT * FROM rubrics WHERE id = ?").get(id) as
    | RawRubricRow
    | undefined;
}

export function deleteRubric(id: number): void {
  getDb().prepare("DELETE FROM rubrics WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------
// submissions
// ---------------------------------------------------------------------------

export function listSubmissions(assessmentId: number): SubmissionRow[] {
  const rows = getDb()
    .prepare("SELECT * FROM submissions WHERE assessment_id = ? ORDER BY id")
    .all(assessmentId) as RawSubmissionRow[];
  return rows.map(mapSubmission);
}

export function getSubmission(id: number): SubmissionRow | undefined {
  const row = getDb().prepare("SELECT * FROM submissions WHERE id = ?").get(id) as
    | RawSubmissionRow
    | undefined;
  return row ? mapSubmission(row) : undefined;
}

export function insertSubmission(input: {
  assessment_id: number;
  student_id?: number | null;
  pdf_path?: string | null;
  page_count?: number | null;
  scratch_pages?: number[] | null;
  status?: SubmissionStatus;
  warnings?: string[] | null;
}): SubmissionRow {
  const result = getDb()
    .prepare(
      `INSERT INTO submissions (assessment_id, student_id, pdf_path, page_count, scratch_pages, status, warnings)
       VALUES (@assessment_id, @student_id, @pdf_path, @page_count, @scratch_pages, @status, @warnings)`
    )
    .run({
      assessment_id: input.assessment_id,
      student_id: input.student_id ?? null,
      pdf_path: input.pdf_path ?? null,
      page_count: input.page_count ?? null,
      scratch_pages: input.scratch_pages ? JSON.stringify(input.scratch_pages) : null,
      status: input.status ?? "uploaded",
      warnings: input.warnings ? JSON.stringify(input.warnings) : null,
    });
  return getSubmission(result.lastInsertRowid as number)!;
}

export function updateSubmission(
  id: number,
  patch: Partial<{
    student_id: number | null;
    pdf_path: string | null;
    page_count: number | null;
    scratch_pages: number[] | null;
    status: SubmissionStatus;
    warnings: string[] | null;
  }>
): SubmissionRow | undefined {
  const current = getSubmission(id);
  if (!current) return undefined;
  const next = { ...current, ...patch };
  getDb()
    .prepare(
      `UPDATE submissions SET student_id = @student_id, pdf_path = @pdf_path,
       page_count = @page_count, scratch_pages = @scratch_pages, status = @status,
       warnings = @warnings WHERE id = @id`
    )
    .run({
      id,
      student_id: next.student_id,
      pdf_path: next.pdf_path,
      page_count: next.page_count,
      scratch_pages: next.scratch_pages ? JSON.stringify(next.scratch_pages) : null,
      status: next.status,
      warnings: next.warnings ? JSON.stringify(next.warnings) : null,
    });
  return getSubmission(id);
}

/**
 * Deletes a submission and all of its dependent rows (transcripts, gradings,
 * criterion levels, report, DP result) in one transaction. Foreign keys are
 * enforced, so the children must go first. On-disk artifacts (rasterized pages,
 * the uploaded PDF) are removed by the caller — this layer only touches the DB.
 */
export function deleteSubmission(id: number): void {
  const db = getDb();
  const run = db.transaction((subId: number) => {
    db.prepare("DELETE FROM transcripts WHERE submission_id = ?").run(subId);
    db.prepare("DELETE FROM gradings WHERE submission_id = ?").run(subId);
    db.prepare("DELETE FROM criterion_levels WHERE submission_id = ?").run(subId);
    db.prepare("DELETE FROM reports WHERE submission_id = ?").run(subId);
    db.prepare("DELETE FROM dp_results WHERE submission_id = ?").run(subId);
    db.prepare("DELETE FROM question_error_tags WHERE submission_id = ?").run(subId);
    db.prepare("DELETE FROM question_skill_tags WHERE submission_id = ?").run(subId);
    db.prepare("DELETE FROM submissions WHERE id = ?").run(subId);
  });
  run(id);
}

// ---------------------------------------------------------------------------
// transcripts
// ---------------------------------------------------------------------------

export function listTranscripts(submissionId: number): TranscriptRow[] {
  const rows = getDb()
    .prepare("SELECT * FROM transcripts WHERE submission_id = ? ORDER BY question_id")
    .all(submissionId) as RawTranscriptRow[];
  return rows.map(mapTranscript);
}

export function getTranscript(
  submissionId: number,
  questionId: number
): TranscriptRow | undefined {
  const row = getDb()
    .prepare("SELECT * FROM transcripts WHERE submission_id = ? AND question_id = ?")
    .get(submissionId, questionId) as RawTranscriptRow | undefined;
  return row ? mapTranscript(row) : undefined;
}

/** Insert or replace the transcript for (submission, question). */
export function upsertTranscript(input: {
  submission_id: number;
  question_id: number;
  content: TranscriptQuestion;
}): TranscriptRow {
  getDb()
    .prepare(
      `INSERT INTO transcripts (submission_id, question_id, content)
       VALUES (@submission_id, @question_id, @content)
       ON CONFLICT(submission_id, question_id) DO UPDATE SET content = excluded.content`
    )
    .run({
      submission_id: input.submission_id,
      question_id: input.question_id,
      content: JSON.stringify(input.content),
    });
  return getTranscript(input.submission_id, input.question_id)!;
}

export function deleteTranscript(id: number): void {
  getDb().prepare("DELETE FROM transcripts WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------
// gradings
// ---------------------------------------------------------------------------

export function listGradings(submissionId: number): GradingRow[] {
  const rows = getDb()
    .prepare("SELECT * FROM gradings WHERE submission_id = ? ORDER BY question_id")
    .all(submissionId) as RawGradingRow[];
  return rows.map(mapGrading);
}

export function getGrading(submissionId: number, questionId: number): GradingRow | undefined {
  const row = getDb()
    .prepare("SELECT * FROM gradings WHERE submission_id = ? AND question_id = ?")
    .get(submissionId, questionId) as RawGradingRow | undefined;
  return row ? mapGrading(row) : undefined;
}

/** Insert or replace the grading for (submission, question). */
export function upsertGrading(input: {
  submission_id: number;
  question_id: number;
  content: GradingQuestion;
}): GradingRow {
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
  return getGrading(input.submission_id, input.question_id)!;
}

export function deleteGrading(id: number): void {
  getDb().prepare("DELETE FROM gradings WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------
// sheet_marks
// ---------------------------------------------------------------------------

type RawSheetMarkRow = Omit<SheetMarkRow, "from_blank"> & { from_blank: number };

function mapSheetMark(row: RawSheetMarkRow): SheetMarkRow {
  return { ...row, from_blank: row.from_blank === 1 };
}

export function listSheetMarks(submissionId: number): SheetMarkRow[] {
  const rows = getDb()
    .prepare("SELECT * FROM sheet_marks WHERE submission_id = ? ORDER BY question_id")
    .all(submissionId) as RawSheetMarkRow[];
  return rows.map(mapSheetMark);
}

export function listSheetMarksForAssessment(assessmentId: number): SheetMarkRow[] {
  const rows = getDb()
    .prepare(
      `SELECT sm.* FROM sheet_marks sm
       JOIN submissions s ON s.id = sm.submission_id
       WHERE s.assessment_id = ?
       ORDER BY sm.submission_id, sm.question_id`
    )
    .all(assessmentId) as RawSheetMarkRow[];
  return rows.map(mapSheetMark);
}

/** A new upload supersedes the last one: clear the assessment's rows, then insert. */
export function replaceSheetMarks(
  assessmentId: number,
  marks: {
    submission_id: number;
    question_id: number;
    points: number;
    from_blank: boolean;
    app_points: number | null;
  }[]
): void {
  const db = getDb();
  const run = db.transaction(() => {
    db.prepare(
      "DELETE FROM sheet_marks WHERE submission_id IN (SELECT id FROM submissions WHERE assessment_id = ?)"
    ).run(assessmentId);
    const insert = db.prepare(
      `INSERT INTO sheet_marks (submission_id, question_id, points, from_blank, app_points)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const m of marks) {
      insert.run(m.submission_id, m.question_id, m.points, m.from_blank ? 1 : 0, m.app_points);
    }
  });
  run();
}

export function setSheetMarkResolution(
  submissionId: number,
  questionId: number,
  resolution: "mine" | "app"
): void {
  getDb()
    .prepare("UPDATE sheet_marks SET resolution = ? WHERE submission_id = ? AND question_id = ?")
    .run(resolution, submissionId, questionId);
}

export function getMarksSheet(assessmentId: number): MarksSheetRow | undefined {
  const row = getDb()
    .prepare("SELECT * FROM marks_sheets WHERE assessment_id = ?")
    .get(assessmentId) as (Omit<MarksSheetRow, "summary"> & { summary: string }) | undefined;
  return row ? { ...row, summary: JSON.parse(row.summary) as MarksUploadSummary } : undefined;
}

/** Records the uploaded sheet, replacing the assessment's previous one. */
export function upsertMarksSheet(input: {
  assessment_id: number;
  file_name: string;
  summary: MarksUploadSummary;
}): void {
  getDb()
    .prepare(
      `INSERT INTO marks_sheets (assessment_id, file_name, summary)
       VALUES (@assessment_id, @file_name, @summary)
       ON CONFLICT(assessment_id) DO UPDATE SET
         file_name = excluded.file_name,
         summary = excluded.summary,
         uploaded_at = datetime('now')`
    )
    .run({ ...input, summary: JSON.stringify(input.summary) });
}

/** Removes the sheet and its whole comparison. Marks already taken from it stay. */
export function deleteMarksSheet(assessmentId: number): void {
  const db = getDb();
  const run = db.transaction(() => {
    db.prepare(
      "DELETE FROM sheet_marks WHERE submission_id IN (SELECT id FROM submissions WHERE assessment_id = ?)"
    ).run(assessmentId);
    db.prepare("DELETE FROM marks_sheets WHERE assessment_id = ?").run(assessmentId);
  });
  run();
}

// ---------------------------------------------------------------------------
// criterion_levels
// ---------------------------------------------------------------------------

export function listCriterionLevels(submissionId: number): CriterionLevelRow[] {
  return getDb()
    .prepare("SELECT * FROM criterion_levels WHERE submission_id = ? ORDER BY criterion")
    .all(submissionId) as RawCriterionLevelRow[];
}

export function getCriterionLevel(
  submissionId: number,
  criterion: string
): CriterionLevelRow | undefined {
  return getDb()
    .prepare("SELECT * FROM criterion_levels WHERE submission_id = ? AND criterion = ?")
    .get(submissionId, criterion) as RawCriterionLevelRow | undefined;
}

/** Insert or replace the criterion level for (submission, criterion). */
export function upsertCriterionLevel(input: {
  submission_id: number;
  criterion: string;
  level_proposed: number;
  level_conservative: number;
  level_final?: number | null;
  evidence: string;
}): CriterionLevelRow {
  getDb()
    .prepare(
      `INSERT INTO criterion_levels (submission_id, criterion, level_proposed, level_conservative, level_final, evidence)
       VALUES (@submission_id, @criterion, @level_proposed, @level_conservative, @level_final, @evidence)
       ON CONFLICT(submission_id, criterion) DO UPDATE SET
         level_proposed = excluded.level_proposed,
         level_conservative = excluded.level_conservative,
         level_final = excluded.level_final,
         evidence = excluded.evidence`
    )
    .run({ ...input, level_final: input.level_final ?? null });
  return getCriterionLevel(input.submission_id, input.criterion)!;
}

export function deleteCriterionLevel(id: number): void {
  getDb().prepare("DELETE FROM criterion_levels WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------
// rubric_descriptors / descriptor_checks (the B/C/D tick-off breakdown)
// ---------------------------------------------------------------------------

export function listRubricDescriptors(
  assessmentId: number,
  criterion?: string
): RubricDescriptorRow[] {
  const db = getDb();
  const rows = criterion
    ? db
        .prepare(
          `SELECT * FROM rubric_descriptors WHERE assessment_id = ? AND criterion = ?
            ORDER BY band, position, id`
        )
        .all(assessmentId, criterion)
    : db
        .prepare(
          `SELECT * FROM rubric_descriptors WHERE assessment_id = ?
            ORDER BY criterion, band, position, id`
        )
        .all(assessmentId);
  return rows as RawRubricDescriptorRow[];
}

export function getRubricDescriptor(id: number): RubricDescriptorRow | undefined {
  return getDb().prepare("SELECT * FROM rubric_descriptors WHERE id = ?").get(id) as
    | RawRubricDescriptorRow
    | undefined;
}

export type RubricDescriptorInput = {
  /** The row this edits; null for one the teacher just added. */
  id: number | null;
  band: RubricDescriptorRow["band"];
  strand: string | null;
  position: number;
  text: string;
  student_text: string | null;
};

/**
 * Writes one criterion's descriptor set, as a diff rather than a replacement:
 * rows whose id comes back are updated in place, rows without an id are inserted,
 * and rows that have disappeared are deleted (taking their checks with them via
 * the cascade). Keeping surviving ids stable is the whole point — a student's
 * ticks hang off the descriptor id, so fixing a typo must not discard them.
 */
export function saveRubricDescriptors(
  assessmentId: number,
  criterion: string,
  descriptors: RubricDescriptorInput[]
): RubricDescriptorRow[] {
  const db = getDb();
  const run = db.transaction(() => {
    const existing = listRubricDescriptors(assessmentId, criterion);
    const kept = new Set(descriptors.map((d) => d.id).filter((id): id is number => id != null));
    for (const row of existing) {
      if (!kept.has(row.id)) {
        db.prepare("DELETE FROM rubric_descriptors WHERE id = ?").run(row.id);
      }
    }
    for (const d of descriptors) {
      if (d.id != null && existing.some((row) => row.id === d.id)) {
        db.prepare(
          `UPDATE rubric_descriptors
              SET band = @band, strand = @strand, position = @position,
                  text = @text, student_text = @student_text
            WHERE id = @id`
        ).run({ ...d, id: d.id });
      } else {
        db.prepare(
          `INSERT INTO rubric_descriptors (assessment_id, criterion, band, strand, position, text, student_text)
           VALUES (@assessment_id, @criterion, @band, @strand, @position, @text, @student_text)`
        ).run({ ...d, assessment_id: assessmentId, criterion });
      }
    }
  });
  run();
  return listRubricDescriptors(assessmentId, criterion);
}

/** What deleting a descriptor would destroy, for an informed confirmation. */
export function getDescriptorFootprint(id: number): { checks: number; students: number } {
  const db = getDb();
  const one = (sql: string) => (db.prepare(sql).get(id) as { n: number }).n;
  return {
    checks: one("SELECT count(*) AS n FROM descriptor_checks WHERE descriptor_id = ?"),
    students: one(
      `SELECT count(DISTINCT sub.student_id) AS n
         FROM descriptor_checks c JOIN submissions sub ON c.submission_id = sub.id
        WHERE c.descriptor_id = ?`
    ),
  };
}

export function listDescriptorChecks(submissionId: number): DescriptorCheckRow[] {
  return getDb()
    .prepare("SELECT * FROM descriptor_checks WHERE submission_id = ? ORDER BY descriptor_id")
    .all(submissionId) as RawDescriptorCheckRow[];
}

export function getDescriptorCheck(
  submissionId: number,
  descriptorId: number
): DescriptorCheckRow | undefined {
  return getDb()
    .prepare("SELECT * FROM descriptor_checks WHERE submission_id = ? AND descriptor_id = ?")
    .get(submissionId, descriptorId) as RawDescriptorCheckRow | undefined;
}

/** Insert or replace one student's judgement on one descriptor. */
export function upsertDescriptorCheck(input: {
  submission_id: number;
  descriptor_id: number;
  met_proposed: number | null;
  met_final?: number | null;
  evidence: string;
  text_at_check: string;
}): DescriptorCheckRow {
  getDb()
    .prepare(
      `INSERT INTO descriptor_checks (submission_id, descriptor_id, met_proposed, met_final, evidence, text_at_check)
       VALUES (@submission_id, @descriptor_id, @met_proposed, @met_final, @evidence, @text_at_check)
       ON CONFLICT(submission_id, descriptor_id) DO UPDATE SET
         met_proposed = excluded.met_proposed,
         met_final = excluded.met_final,
         evidence = excluded.evidence,
         text_at_check = excluded.text_at_check`
    )
    .run({ ...input, met_final: input.met_final ?? null });
  return getDescriptorCheck(input.submission_id, input.descriptor_id)!;
}

// ---------------------------------------------------------------------------
// reports
// ---------------------------------------------------------------------------

export function getReport(submissionId: number): ReportRow | undefined {
  const row = getDb()
    .prepare("SELECT * FROM reports WHERE submission_id = ?")
    .get(submissionId) as RawReportRow | undefined;
  return row ? mapReport(row) : undefined;
}

/** Insert or replace the report for a submission (one report per submission). */
export function upsertReport(input: {
  submission_id: number;
  sections: ReportSections;
  status?: "draft" | "approved";
}): ReportRow {
  getDb()
    .prepare(
      `INSERT INTO reports (submission_id, sections, status)
       VALUES (@submission_id, @sections, @status)
       ON CONFLICT(submission_id) DO UPDATE SET sections = excluded.sections, status = excluded.status`
    )
    .run({
      submission_id: input.submission_id,
      sections: JSON.stringify(input.sections),
      status: input.status ?? "draft",
    });
  return getReport(input.submission_id)!;
}

export function deleteReport(id: number): void {
  getDb().prepare("DELETE FROM reports WHERE id = ?").run(id);
}

/**
 * When an upstream input (transcript, marks) changes after a report was approved, the
 * approved report is no longer guaranteed to reflect the current evidence. Revert it to
 * draft so it is not presented as final until the teacher reviews and re-approves.
 * Returns true if a report was un-approved. No-op if there is no approved report.
 */
export function unapproveReportIfApproved(submissionId: number): boolean {
  const row = getReport(submissionId);
  if (!row || row.status !== "approved") return false;
  upsertReport({ submission_id: submissionId, sections: row.sections, status: "draft" });
  return true;
}

// ---------------------------------------------------------------------------
// style_examples
// ---------------------------------------------------------------------------

export function listStyleExamples(kind?: StyleExampleKind): StyleExampleRow[] {
  if (kind) {
    return getDb()
      .prepare("SELECT * FROM style_examples WHERE kind = ? ORDER BY id")
      .all(kind) as RawStyleExampleRow[];
  }
  return getDb().prepare("SELECT * FROM style_examples ORDER BY id").all() as RawStyleExampleRow[];
}

export function insertStyleExample(input: {
  kind: StyleExampleKind;
  content: string;
}): StyleExampleRow {
  const result = getDb()
    .prepare("INSERT INTO style_examples (kind, content) VALUES (@kind, @content)")
    .run(input);
  return getDb()
    .prepare("SELECT * FROM style_examples WHERE id = ?")
    .get(result.lastInsertRowid as number) as RawStyleExampleRow;
}

export function deleteStyleExample(id: number): void {
  getDb().prepare("DELETE FROM style_examples WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------
// ai_requests
// ---------------------------------------------------------------------------

export function insertAiRequest(input: {
  purpose: string;
  prompt_file: string;
  response_file?: string | null;
}): AiRequestRow {
  const result = getDb()
    .prepare(
      "INSERT INTO ai_requests (purpose, prompt_file, response_file) VALUES (@purpose, @prompt_file, @response_file)"
    )
    .run({ ...input, response_file: input.response_file ?? null });
  return getDb()
    .prepare("SELECT * FROM ai_requests WHERE id = ?")
    .get(result.lastInsertRowid as number) as RawAiRequestRow;
}

export function updateAiRequestResponse(id: number, responseFile: string): AiRequestRow {
  getDb()
    .prepare("UPDATE ai_requests SET response_file = @response_file WHERE id = @id")
    .run({ id, response_file: responseFile });
  return getDb().prepare("SELECT * FROM ai_requests WHERE id = ?").get(id) as RawAiRequestRow;
}

export function getAiRequest(id: number): AiRequestRow | undefined {
  return getDb().prepare("SELECT * FROM ai_requests WHERE id = ?").get(id) as
    | RawAiRequestRow
    | undefined;
}

export function listAiRequests(): AiRequestRow[] {
  return getDb()
    .prepare("SELECT * FROM ai_requests ORDER BY created_at DESC")
    .all() as RawAiRequestRow[];
}

// ---------------------------------------------------------------------------
// dp_results — one row per submission (pct + grade from boundaries)
// ---------------------------------------------------------------------------

export function getDpResult(submissionId: number): DpResultRow | undefined {
  return getDb().prepare("SELECT * FROM dp_results WHERE submission_id = ?").get(submissionId) as
    | RawDpResultRow
    | undefined;
}

/** Insert or replace the DP result for a submission (one row per submission). */
export function upsertDpResult(input: {
  submission_id: number;
  total_marks: number;
  max_marks: number;
  pct: number;
  grade: number;
  grade_final?: number | null;
}): DpResultRow {
  getDb()
    .prepare(
      `INSERT INTO dp_results (submission_id, total_marks, max_marks, pct, grade, grade_final)
       VALUES (@submission_id, @total_marks, @max_marks, @pct, @grade, @grade_final)
       ON CONFLICT(submission_id) DO UPDATE SET
         total_marks = excluded.total_marks,
         max_marks = excluded.max_marks,
         pct = excluded.pct,
         grade = excluded.grade,
         grade_final = excluded.grade_final`
    )
    .run({ ...input, grade_final: input.grade_final ?? null });
  return getDpResult(input.submission_id)!;
}

export function deleteDpResult(id: number): void {
  getDb().prepare("DELETE FROM dp_results WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------
// ia_deadlines — target dates per class + milestone
// ---------------------------------------------------------------------------

export function listIaDeadlines(classId: number): IaDeadlineRow[] {
  return getDb()
    .prepare("SELECT * FROM ia_deadlines WHERE class_id = ? ORDER BY due_date")
    .all(classId) as RawIaDeadlineRow[];
}

/** Insert or replace the deadline for (class, milestone) — setup re-saves the whole table. */
export function upsertIaDeadline(input: {
  class_id: number;
  milestone: IaMilestone;
  due_date: string;
}): IaDeadlineRow {
  getDb()
    .prepare(
      `INSERT INTO ia_deadlines (class_id, milestone, due_date)
       VALUES (@class_id, @milestone, @due_date)
       ON CONFLICT(class_id, milestone) DO UPDATE SET due_date = excluded.due_date`
    )
    .run(input);
  return getDb()
    .prepare("SELECT * FROM ia_deadlines WHERE class_id = ? AND milestone = ?")
    .get(input.class_id, input.milestone) as RawIaDeadlineRow;
}

export function deleteIaDeadline(id: number): void {
  getDb().prepare("DELETE FROM ia_deadlines WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------
// ia_explorations — one per student
// ---------------------------------------------------------------------------

export function getIaExploration(id: number): IaExplorationRow | undefined {
  return getDb().prepare("SELECT * FROM ia_explorations WHERE id = ?").get(id) as
    | RawIaExplorationRow
    | undefined;
}

export function getIaExplorationByStudent(studentId: number): IaExplorationRow | undefined {
  return getDb()
    .prepare("SELECT * FROM ia_explorations WHERE student_id = ?")
    .get(studentId) as RawIaExplorationRow | undefined;
}

/** Returns the student's existing exploration or creates a new (empty-topic) one. */
export function findOrCreateIaExploration(studentId: number): IaExplorationRow {
  const existing = getIaExplorationByStudent(studentId);
  if (existing) return existing;
  const result = getDb()
    .prepare("INSERT INTO ia_explorations (student_id) VALUES (?)")
    .run(studentId);
  return getIaExploration(result.lastInsertRowid as number)!;
}

export function updateIaExplorationTopic(
  id: number,
  topic: string | null
): IaExplorationRow | undefined {
  getDb().prepare("UPDATE ia_explorations SET topic = @topic WHERE id = @id").run({ id, topic });
  return getIaExploration(id);
}

// ---------------------------------------------------------------------------
// ia_progress — milestone completion toggle per exploration
// ---------------------------------------------------------------------------

export function listIaProgress(explorationId: number): IaProgressRow[] {
  return getDb()
    .prepare("SELECT * FROM ia_progress WHERE exploration_id = ? ORDER BY completed_at")
    .all(explorationId) as RawIaProgressRow[];
}

/** Marks a milestone complete (now, or replacing the existing completion timestamp). */
export function setIaMilestoneComplete(
  explorationId: number,
  milestone: IaMilestone
): IaProgressRow {
  getDb()
    .prepare(
      `INSERT INTO ia_progress (exploration_id, milestone)
       VALUES (@exploration_id, @milestone)
       ON CONFLICT(exploration_id, milestone) DO UPDATE SET completed_at = datetime('now')`
    )
    .run({ exploration_id: explorationId, milestone });
  return getDb()
    .prepare("SELECT * FROM ia_progress WHERE exploration_id = ? AND milestone = ?")
    .get(explorationId, milestone) as RawIaProgressRow;
}

/** Toggles a milestone back to incomplete by removing its progress row. */
export function clearIaMilestone(explorationId: number, milestone: IaMilestone): void {
  getDb()
    .prepare("DELETE FROM ia_progress WHERE exploration_id = ? AND milestone = ?")
    .run(explorationId, milestone);
}

// ---------------------------------------------------------------------------
// ia_documents — uploaded draft/final (pseudonymized text)
// ---------------------------------------------------------------------------

export function listIaDocuments(explorationId: number): IaDocumentRow[] {
  return getDb()
    .prepare("SELECT * FROM ia_documents WHERE exploration_id = ? ORDER BY uploaded_at DESC")
    .all(explorationId) as RawIaDocumentRow[];
}

export function getIaDocument(id: number): IaDocumentRow | undefined {
  return getDb().prepare("SELECT * FROM ia_documents WHERE id = ?").get(id) as
    | RawIaDocumentRow
    | undefined;
}

/** Latest uploaded document of a given kind ('draft' | 'final') for an exploration. */
export function getLatestIaDocument(
  explorationId: number,
  kind: IaDocumentKind
): IaDocumentRow | undefined {
  return getDb()
    .prepare(
      "SELECT * FROM ia_documents WHERE exploration_id = ? AND kind = ? ORDER BY uploaded_at DESC LIMIT 1"
    )
    .get(explorationId, kind) as RawIaDocumentRow | undefined;
}

export function insertIaDocument(input: {
  exploration_id: number;
  kind: IaDocumentKind;
  file_path?: string | null;
  text?: string | null;
  original_name?: string | null;
}): IaDocumentRow {
  const result = getDb()
    .prepare(
      `INSERT INTO ia_documents (exploration_id, kind, file_path, text, original_name)
       VALUES (@exploration_id, @kind, @file_path, @text, @original_name)`
    )
    .run({
      exploration_id: input.exploration_id,
      kind: input.kind,
      file_path: input.file_path ?? null,
      text: input.text ?? null,
      original_name: input.original_name ?? null,
    });
  return getIaDocument(result.lastInsertRowid as number)!;
}

export function deleteIaDocument(id: number): void {
  getDb().prepare("DELETE FROM ia_documents WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------
// ia_outputs — draft feedback / final marks (no unique key: history is kept)
// ---------------------------------------------------------------------------

export function listIaOutputs(explorationId: number): IaOutputRow[] {
  const rows = getDb()
    .prepare("SELECT * FROM ia_outputs WHERE exploration_id = ? ORDER BY created_at DESC")
    .all(explorationId) as RawIaOutputRow[];
  return rows.map(mapIaOutput);
}

/** Most recent output of a given kind ('draft_feedback' | 'final_marks') for an exploration. */
export function getLatestIaOutput(
  explorationId: number,
  kind: IaOutputKind
): IaOutputRow | undefined {
  const row = getDb()
    .prepare(
      "SELECT * FROM ia_outputs WHERE exploration_id = ? AND kind = ? ORDER BY created_at DESC LIMIT 1"
    )
    .get(explorationId, kind) as RawIaOutputRow | undefined;
  return row ? mapIaOutput(row) : undefined;
}

export function getIaOutput(id: number): IaOutputRow | undefined {
  const row = getDb().prepare("SELECT * FROM ia_outputs WHERE id = ?").get(id) as
    | RawIaOutputRow
    | undefined;
  return row ? mapIaOutput(row) : undefined;
}

export function insertIaOutput(input: {
  exploration_id: number;
  kind: IaOutputKind;
  content: unknown;
  status?: IaOutputStatus;
}): IaOutputRow {
  const result = getDb()
    .prepare(
      `INSERT INTO ia_outputs (exploration_id, kind, content, status)
       VALUES (@exploration_id, @kind, @content, @status)`
    )
    .run({
      exploration_id: input.exploration_id,
      kind: input.kind,
      content: JSON.stringify(input.content),
      status: input.status ?? "draft",
    });
  return getIaOutput(result.lastInsertRowid as number)!;
}

export function updateIaOutputStatus(id: number, status: IaOutputStatus): IaOutputRow | undefined {
  getDb().prepare("UPDATE ia_outputs SET status = @status WHERE id = @id").run({ id, status });
  return getIaOutput(id);
}

export function updateIaOutputContent(id: number, content: unknown): IaOutputRow | undefined {
  getDb()
    .prepare("UPDATE ia_outputs SET content = @content WHERE id = @id")
    .run({ id, content: JSON.stringify(content) });
  return getIaOutput(id);
}

export function deleteIaOutput(id: number): void {
  getDb().prepare("DELETE FROM ia_outputs WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------
// marking_instructions — teacher's standing / per-assessment marking notes,
// injected into the grading prompt so a repeated mistake can be corrected once.
// ---------------------------------------------------------------------------

export function insertMarkingInstruction(input: {
  scope: MarkingInstructionScope;
  programme?: Programme | null;
  assessment_id?: number | null;
  text: string;
}): MarkingInstructionRow {
  const result = getDb()
    .prepare(
      `INSERT INTO marking_instructions (scope, programme, assessment_id, text)
       VALUES (@scope, @programme, @assessment_id, @text)`
    )
    .run({
      scope: input.scope,
      programme: input.programme ?? null,
      assessment_id: input.assessment_id ?? null,
      text: input.text,
    });
  return getMarkingInstruction(Number(result.lastInsertRowid))!;
}

export function getMarkingInstruction(id: number): MarkingInstructionRow | undefined {
  return getDb().prepare("SELECT * FROM marking_instructions WHERE id = ?").get(id) as
    | MarkingInstructionRow
    | undefined;
}

export function deleteMarkingInstruction(id: number): void {
  getDb().prepare("DELETE FROM marking_instructions WHERE id = ?").run(id);
}

/** All standing notes, plus every per-assessment note (for the Settings manager). */
export function listAllMarkingInstructions(): MarkingInstructionRow[] {
  return getDb()
    .prepare("SELECT * FROM marking_instructions ORDER BY scope, created_at")
    .all() as MarkingInstructionRow[];
}

/** The per-assessment notes for one assessment. */
export function listAssessmentMarkingInstructions(assessmentId: number): MarkingInstructionRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM marking_instructions WHERE scope = 'assessment' AND assessment_id = ? ORDER BY created_at"
    )
    .all(assessmentId) as MarkingInstructionRow[];
}

/**
 * The notes that APPLY when grading a given assessment: standing notes whose
 * programme is null (all) or matches this assessment's programme, plus this
 * assessment's own notes. Oldest first.
 */
export function getApplicableMarkingInstructions(assessmentId: number): MarkingInstructionRow[] {
  const assessment = getAssessment(assessmentId);
  if (!assessment) return [];
  return getDb()
    .prepare(
      `SELECT * FROM marking_instructions
       WHERE (scope = 'standing' AND (programme IS NULL OR programme = @programme))
          OR (scope = 'assessment' AND assessment_id = @assessmentId)
       ORDER BY scope DESC, created_at`
    )
    .all({ programme: assessment.programme, assessmentId }) as MarkingInstructionRow[];
}

// ---------------------------------------------------------------------------
// app_settings — small editable singletons (key -> value)
// ---------------------------------------------------------------------------

export function getAppSetting(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setAppSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (@key, @value, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = datetime('now')`
    )
    .run({ key, value });
}

/** The teacher's personal IA checklist, fed into both IA prompts. "" if unset. */
export const IA_CHECKLIST_KEY = "ia_checklist";
export function getIaChecklist(): string {
  return getAppSetting(IA_CHECKLIST_KEY) ?? "";
}
export function setIaChecklist(text: string): void {
  setAppSetting(IA_CHECKLIST_KEY, text);
}

// ---------------------------------------------------------------------------
// Error mechanism tags
// ---------------------------------------------------------------------------

export type QuestionErrorTagRow = {
  id: number;
  submission_id: number;
  question_id: number;
  mechanism: string;
  quote: string;
  created_at: string;
};

export function listErrorTags(submissionId: number): QuestionErrorTagRow[] {
  return getDb()
    .prepare("SELECT * FROM question_error_tags WHERE submission_id = ? ORDER BY question_id, mechanism")
    .all(submissionId) as QuestionErrorTagRow[];
}

/** Re-tagging a paper replaces its tags outright, the way re-grading replaces its marks. */
export function replaceErrorTags(
  submissionId: number,
  tags: { question_id: number; mechanism: string; quote: string }[]
): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM question_error_tags WHERE submission_id = ?").run(submissionId);
    const insert = db.prepare(
      `INSERT OR IGNORE INTO question_error_tags (submission_id, question_id, mechanism, quote)
       VALUES (?, ?, ?, ?)`
    );
    for (const tag of tags) insert.run(submissionId, tag.question_id, tag.mechanism, tag.quote);
  })();
}

/**
 * Has this paper been through the classifier? Deliberately not "does it have
 * tags": a paper whose mistakes matched no mechanism has none, and asking the
 * tags table would send it back through the classifier every single time.
 */
export function hasErrorTags(submissionId: number): boolean {
  const row = getDb()
    .prepare("SELECT error_tags_scanned_at FROM submissions WHERE id = ?")
    .get(submissionId) as { error_tags_scanned_at: string | null } | undefined;
  return !!row?.error_tags_scanned_at;
}

export function markErrorTagsScanned(submissionId: number): void {
  getDb()
    .prepare("UPDATE submissions SET error_tags_scanned_at = datetime('now') WHERE id = ?")
    .run(submissionId);
}

// ---------------------------------------------------------------------------
// Core skill tags
// ---------------------------------------------------------------------------

export type QuestionSkillTagRow = {
  id: number;
  submission_id: number;
  question_id: number;
  skill: string;
  quote: string;
  created_at: string;
};

export function listSkillTags(submissionId: number): QuestionSkillTagRow[] {
  return getDb()
    .prepare("SELECT * FROM question_skill_tags WHERE submission_id = ? ORDER BY question_id, skill")
    .all(submissionId) as QuestionSkillTagRow[];
}

/** Re-tagging a paper replaces its skill tags outright, as with mechanisms. */
export function replaceSkillTags(
  submissionId: number,
  tags: { question_id: number; skill: string; quote: string }[]
): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM question_skill_tags WHERE submission_id = ?").run(submissionId);
    const insert = db.prepare(
      `INSERT OR IGNORE INTO question_skill_tags (submission_id, question_id, skill, quote)
       VALUES (?, ?, ?, ?)`
    );
    for (const tag of tags) insert.run(submissionId, tag.question_id, tag.skill, tag.quote);
  })();
}

/** Has this paper been through the skills pass? Same reasoning as hasErrorTags. */
export function hasSkillTags(submissionId: number): boolean {
  const row = getDb()
    .prepare("SELECT skill_tags_scanned_at FROM submissions WHERE id = ?")
    .get(submissionId) as { skill_tags_scanned_at: string | null } | undefined;
  return !!row?.skill_tags_scanned_at;
}

export function markSkillTagsScanned(submissionId: number): void {
  getDb()
    .prepare("UPDATE submissions SET skill_tags_scanned_at = datetime('now') WHERE id = ?")
    .run(submissionId);
}

// ---------------------------------------------------------------------------
// Conference evenings
// ---------------------------------------------------------------------------

export type ConferenceSessionRow = {
  id: number;
  date: string;
  label: string | null;
  created_at: string;
};

export type ConferenceMeetingRow = {
  id: number;
  session_id: number;
  student_id: number | null;
  position: number;
  at_time: string | null;
  parent_name: string | null;
  raw_name: string;
  done: number;
  created_at: string;
};

export function listConferenceSessions(): ConferenceSessionRow[] {
  return getDb()
    .prepare("SELECT * FROM conference_sessions ORDER BY date DESC, id DESC")
    .all() as ConferenceSessionRow[];
}

export function getConferenceSession(id: number): ConferenceSessionRow | undefined {
  return getDb().prepare("SELECT * FROM conference_sessions WHERE id = ?").get(id) as
    | ConferenceSessionRow
    | undefined;
}

export function listConferenceMeetings(sessionId: number): ConferenceMeetingRow[] {
  return getDb()
    .prepare("SELECT * FROM conference_meetings WHERE session_id = ? ORDER BY position, id")
    .all(sessionId) as ConferenceMeetingRow[];
}

/** The evening a student's meeting belongs to, for the walk on their page. */
export function findConferenceMeeting(
  sessionId: number,
  studentId: number
): ConferenceMeetingRow | undefined {
  return getDb()
    .prepare("SELECT * FROM conference_meetings WHERE session_id = ? AND student_id = ?")
    .get(sessionId, studentId) as ConferenceMeetingRow | undefined;
}

/** Re-reading a schedule replaces the evening's meetings outright. */
export function replaceConferenceMeetings(
  sessionId: number,
  meetings: {
    student_id: number | null;
    at_time: string | null;
    parent_name: string | null;
    raw_name: string;
  }[]
): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM conference_meetings WHERE session_id = ?").run(sessionId);
    const insert = db.prepare(
      `INSERT INTO conference_meetings (session_id, student_id, position, at_time, parent_name, raw_name)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    meetings.forEach((m, i) =>
      insert.run(sessionId, m.student_id, i, m.at_time, m.parent_name, m.raw_name)
    );
  })();
}

export function createConferenceSession(date: string, label: string | null): ConferenceSessionRow {
  const info = getDb()
    .prepare("INSERT INTO conference_sessions (date, label) VALUES (?, ?)")
    .run(date, label);
  return getConferenceSession(Number(info.lastInsertRowid))!;
}

export function deleteConferenceSession(id: number): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM conference_meetings WHERE session_id = ?").run(id);
    db.prepare("DELETE FROM conference_sessions WHERE id = ?").run(id);
  })();
}

export function setConferenceMeetingDone(meetingId: number, done: boolean): void {
  getDb()
    .prepare("UPDATE conference_meetings SET done = ? WHERE id = ?")
    .run(done ? 1 : 0, meetingId);
}

// ---------------------------------------------------------------------------
// Student aliases — other names the same child is written under
// ---------------------------------------------------------------------------

export type StudentAliasRow = {
  id: number;
  student_id: number;
  alias: string;
  source: string | null;
  created_at: string;
};

export function listStudentAliases(): StudentAliasRow[] {
  return getDb()
    .prepare("SELECT * FROM student_aliases ORDER BY alias")
    .all() as StudentAliasRow[];
}

/** Remembering it is the point: the same schedule is uploaded again next term. */
export function addStudentAlias(studentId: number, alias: string, source: string | null): void {
  const trimmed = alias.trim();
  if (!trimmed) return;
  getDb()
    .prepare(
      `INSERT INTO student_aliases (student_id, alias, source) VALUES (?, ?, ?)
       ON CONFLICT (alias) DO UPDATE SET student_id = excluded.student_id`
    )
    .run(studentId, trimmed, source);
}

export function deleteStudentAlias(id: number): void {
  getDb().prepare("DELETE FROM student_aliases WHERE id = ?").run(id);
}
