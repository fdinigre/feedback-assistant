import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { REPORT_STRUCTURE } from "@/lib/style/examples";

const DATA_DIR = path.join(process.cwd(), "data");
// The automated checks run against a throwaway database of their own. They set
// MFA_DB_PATH, and refuse to start without it, so they can never open — let
// alone write to — the real one.
if (process.env.VITEST && !process.env.MFA_DB_PATH) {
  throw new Error("Tests must set MFA_DB_PATH; refusing to open the real database.");
}
const DB_PATH = process.env.MFA_DB_PATH || path.join(DATA_DIR, "app.db");
const SCHEMA_PATH = path.join(process.cwd(), "lib", "db", "schema.sql");

let db: Database.Database | undefined;

function seedStyleExamples(instance: Database.Database) {
  const countRow = instance
    .prepare("SELECT COUNT(*) as count FROM style_examples WHERE kind = 'report'")
    .get() as { count: number };
  if (countRow.count > 0) return;
  instance.prepare("INSERT INTO style_examples (kind, content) VALUES ('report', ?)").run(REPORT_STRUCTURE);
}

/**
 * external_data.source used to carry a CHECK(source IN ('MAP','CAT4')) constraint.
 * SQLite has no ALTER TABLE ... DROP CONSTRAINT, so on any startup where the
 * live table still has that CHECK, rebuild it without the constraint,
 * preserving every row. Idempotent: once migrated, sqlite_master.sql for the
 * table no longer contains "CHECK" and this is a no-op on subsequent starts.
 */
function migrateExternalDataCheck(instance: Database.Database): void {
  const row = instance
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'external_data'")
    .get() as { sql: string } | undefined;

  if (!row || !row.sql.includes("CHECK")) return; // not created yet, or already migrated

  const rebuild = instance.transaction(() => {
    instance.exec(`
      CREATE TABLE external_data_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES students(id),
        source TEXT NOT NULL,
        data TEXT NOT NULL, -- JSON
        imported_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO external_data_new (id, student_id, source, data, imported_at)
        SELECT id, student_id, source, data, imported_at FROM external_data;
      DROP TABLE external_data;
      ALTER TABLE external_data_new RENAME TO external_data;
    `);
  });
  rebuild();
}

/**
 * classes gained `programme` and `dp_year` for IBDP support, and the `grade`
 * CHECK widened from (9,10) to (9,10,11,12) (DP Year 1 = 11, Year 2 = 12).
 * Rebuild preserves every row, defaulting programme to 'MYP' and dp_year to
 * NULL for pre-existing rows. Idempotent: skipped once the live table
 * already has a `programme` column.
 */
function migrateClassesForDp(instance: Database.Database): void {
  const columns = instance.prepare("PRAGMA table_info(classes)").all() as { name: string }[];
  if (columns.length === 0 || columns.some((c) => c.name === "programme")) return;

  const rebuild = instance.transaction(() => {
    instance.exec(`
      CREATE TABLE classes_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        grade INTEGER NOT NULL CHECK (grade IN (9, 10, 11, 12)),
        programme TEXT NOT NULL DEFAULT 'MYP' CHECK (programme IN ('MYP', 'DP')),
        dp_year INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO classes_new (id, name, grade, created_at)
        SELECT id, name, grade, created_at FROM classes;
      DROP TABLE classes;
      ALTER TABLE classes_new RENAME TO classes;
    `);
  });
  rebuild();
}

/**
 * learning_targets: grade CHECK widened from (9,10) to (9,10,11,12) so DP
 * grades 11/12 can share the same catalog table. Rebuild preserves every
 * row. Idempotent: skipped once the live CHECK already allows 11 and 12.
 */
function migrateLearningTargetsGradeCheck(instance: Database.Database): void {
  const row = instance
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'learning_targets'")
    .get() as { sql: string } | undefined;

  if (!row || row.sql.includes("11, 12")) return; // not created yet, or already migrated

  const rebuild = instance.transaction(() => {
    instance.exec(`
      CREATE TABLE learning_targets_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grade INTEGER NOT NULL CHECK (grade IN (9, 10, 11, 12)),
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (grade, name)
      );
      INSERT INTO learning_targets_new (id, grade, name, created_at)
        SELECT id, grade, name, created_at FROM learning_targets;
      DROP TABLE learning_targets;
      ALTER TABLE learning_targets_new RENAME TO learning_targets;
    `);
  });
  rebuild();
}

/**
 * assessments gained programme/assessment_type/boundaries/paper_file/
 * markscheme_file/cover_targets (IBDP support), and the `grade` CHECK
 * widened from (9,10) to (9,10,11,12). Rebuild preserves every row,
 * defaulting programme to 'MYP' and leaving the new columns NULL for
 * pre-existing rows. Idempotent: skipped once the live table already has a
 * `programme` column.
 */
function migrateAssessmentsForDp(instance: Database.Database): void {
  const columns = instance.prepare("PRAGMA table_info(assessments)").all() as { name: string }[];
  if (columns.length === 0 || columns.some((c) => c.name === "programme")) return;

  const rebuild = instance.transaction(() => {
    instance.exec(`
      CREATE TABLE assessments_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        grade INTEGER NOT NULL CHECK (grade IN (9, 10, 11, 12)),
        criteria TEXT NOT NULL,
        date TEXT,
        name_mask TEXT,
        status TEXT NOT NULL DEFAULT 'setup',
        programme TEXT NOT NULL DEFAULT 'MYP',
        assessment_type TEXT,
        boundaries TEXT,
        paper_file TEXT,
        markscheme_file TEXT,
        cover_targets TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO assessments_new (id, title, grade, criteria, date, name_mask, status, created_at)
        SELECT id, title, grade, criteria, date, name_mask, status, created_at FROM assessments;
      DROP TABLE assessments;
      ALTER TABLE assessments_new RENAME TO assessments;
    `);
  });
  rebuild();
}

/**
 * questions gained `dp_scheme` (IBDP mark scheme, JSON), and `level_band`
 * became nullable (NULL for DP questions, which have no MYP level band) with
 * its CHECK adjusted to allow NULL. Rebuild preserves every row. Idempotent:
 * skipped once the live table already has a `dp_scheme` column.
 */
/**
 * "We looked and found nothing" is not the same as "we never looked", and the
 * tags table alone cannot tell them apart: a paper whose mistakes matched no
 * mechanism leaves no rows and would be re-classified for ever.
 */
function migrateSubmissionsForErrorScan(instance: Database.Database): void {
  const columns = instance.prepare("PRAGMA table_info(submissions)").all() as { name: string }[];
  if (columns.length === 0 || columns.some((c) => c.name === "error_tags_scanned_at")) return;
  instance.exec("ALTER TABLE submissions ADD COLUMN error_tags_scanned_at TEXT");
}

/** The skills pass has its own marker: papers tagged for mechanisms before it existed still need it. */
function migrateSubmissionsForSkillScan(instance: Database.Database): void {
  const columns = instance.prepare("PRAGMA table_info(submissions)").all() as { name: string }[];
  if (columns.length === 0 || columns.some((c) => c.name === "skill_tags_scanned_at")) return;
  instance.exec("ALTER TABLE submissions ADD COLUMN skill_tags_scanned_at TEXT");
}

function migrateQuestionsForDp(instance: Database.Database): void {
  const columns = instance.prepare("PRAGMA table_info(questions)").all() as { name: string }[];
  if (columns.length === 0 || columns.some((c) => c.name === "dp_scheme")) return;

  const rebuild = instance.transaction(() => {
    instance.exec(`
      CREATE TABLE questions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        assessment_id INTEGER NOT NULL REFERENCES assessments(id),
        number TEXT NOT NULL,
        max_points REAL NOT NULL,
        level_band TEXT CHECK (level_band IS NULL OR level_band IN ('1-2', '3-4', '5-6', '7-8')),
        learning_target_id INTEGER REFERENCES learning_targets(id),
        dp_scheme TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO questions_new (id, assessment_id, number, max_points, level_band, learning_target_id, created_at)
        SELECT id, assessment_id, number, max_points, level_band, learning_target_id, created_at FROM questions;
      DROP TABLE questions;
      ALTER TABLE questions_new RENAME TO questions;
    `);
  });
  rebuild();
}


/**
 * assessments gained `class_id`: an assessment now belongs to one class rather
 * than to a whole grade. Adds the nullable column and backfills it for existing
 * rows, preferring hard evidence over guesswork:
 *   1. the class whose students actually submitted work for the assessment;
 *   2. failing that, the only class matching its grade + programme;
 *   3. otherwise NULL, which callers treat as the old grade-wide behaviour.
 *
 * Where a class is resolved, this also removes the placeholder "absent" rows
 * created for students of *other* classes in the same grade — the bug this
 * column fixes. Only rows with no scan and no marking attached are touched, so
 * nothing that holds work can be lost. Idempotent: skipped once the column exists.
 */
function migrateAssessmentsForClassScope(instance: Database.Database): void {
  const columns = instance.prepare("PRAGMA table_info(assessments)").all() as { name: string }[];
  if (columns.length === 0 || columns.some((c) => c.name === "class_id")) return;

  const run = instance.transaction(() => {
    instance.exec("ALTER TABLE assessments ADD COLUMN class_id INTEGER REFERENCES classes(id)");

    const assessments = instance
      .prepare("SELECT id, grade, programme FROM assessments")
      .all() as { id: number; grade: number; programme: string }[];

    const classesWithWork = instance.prepare(
      `SELECT s.class_id AS class_id, COUNT(*) AS n
         FROM submissions sub
         JOIN students s ON sub.student_id = s.id
        WHERE sub.assessment_id = ? AND sub.status != 'absent'
        GROUP BY s.class_id
        ORDER BY n DESC`
    );
    const classesForGrade = instance.prepare(
      "SELECT id FROM classes WHERE grade = ? AND programme = ?"
    );
    const setClass = instance.prepare("UPDATE assessments SET class_id = ? WHERE id = ?");
    const dropStrayAbsences = instance.prepare(
      `DELETE FROM submissions
        WHERE assessment_id = ?
          AND status = 'absent'
          AND (pdf_path IS NULL OR pdf_path = '')
          AND student_id IN (SELECT id FROM students WHERE class_id != ?)
          AND id NOT IN (SELECT submission_id FROM transcripts)
          AND id NOT IN (SELECT submission_id FROM gradings)
          AND id NOT IN (SELECT submission_id FROM reports)
          AND id NOT IN (SELECT submission_id FROM criterion_levels)
          AND id NOT IN (SELECT submission_id FROM dp_results)`
    );

    for (const a of assessments) {
      const withWork = classesWithWork.all(a.id) as { class_id: number | null; n: number }[];
      let classId = withWork.find((r) => r.class_id !== null)?.class_id ?? null;

      if (classId === null) {
        const candidates = classesForGrade.all(a.grade, a.programme) as { id: number }[];
        if (candidates.length === 1) classId = candidates[0].id;
      }
      if (classId === null) continue;

      setClass.run(classId, a.id);
      dropStrayAbsences.run(a.id, classId);
    }
  });
  run();
}


/**
 * paper_file / markscheme_file used to hold absolute paths built from
 * process.cwd() at upload time. Moving or copying the project folder left every
 * row pointing at a directory that no longer exists, and the markscheme parse
 * failed with "file not found on disk" even though the file was still sitting
 * in data/. Rewrites those rows to project-relative paths.
 *
 * Only rewrites a path that actually contains a "data/" segment, and only when
 * the file is found at the rewritten location, so a row pointing somewhere
 * genuinely unexpected is left alone for a human to look at.
 */
function migrateAssessmentFilePaths(instance: Database.Database): void {
  const columns = instance.prepare("PRAGMA table_info(assessments)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "paper_file")) return;

  const rows = instance
    .prepare(
      `SELECT id, paper_file, markscheme_file FROM assessments
        WHERE paper_file LIKE '/%' OR markscheme_file LIKE '/%'`
    )
    .all() as { id: number; paper_file: string | null; markscheme_file: string | null }[];
  if (rows.length === 0) return;

  const toRelative = (stored: string | null): string | null => {
    if (!stored || !stored.startsWith("/")) return stored;
    const index = stored.lastIndexOf("/data/");
    if (index === -1) return stored;
    const relative = stored.slice(index + 1);
    return fs.existsSync(path.join(process.cwd(), relative)) ? relative : stored;
  };

  const update = instance.prepare(
    "UPDATE assessments SET paper_file = ?, markscheme_file = ? WHERE id = ?"
  );
  const run = instance.transaction(() => {
    for (const row of rows) {
      const paper = toRelative(row.paper_file);
      const markscheme = toRelative(row.markscheme_file);
      if (paper !== row.paper_file || markscheme !== row.markscheme_file) {
        update.run(paper, markscheme, row.id);
      }
    }
  });
  run();
}

/**
 * sheet_marks first shipped without app_points/resolution (a settled difference
 * was simply deleted). Add them where the table predates the kept comparison.
 */
function migrateSheetMarksForKeptComparison(instance: Database.Database): void {
  const columns = instance.prepare("PRAGMA table_info(sheet_marks)").all() as { name: string }[];
  const names = new Set(columns.map((c) => c.name));
  if (!names.has("app_points")) {
    instance.exec("ALTER TABLE sheet_marks ADD COLUMN app_points REAL");
  }
  if (!names.has("resolution")) {
    instance.exec(
      "ALTER TABLE sheet_marks ADD COLUMN resolution TEXT CHECK (resolution IS NULL OR resolution IN ('mine', 'app'))"
    );
  }
}

/**
 * Financial Math (v2): classes carry a course, students a modified flag, and
 * questions a variant. Plain ADD COLUMNs, so no table rebuild is needed.
 */
/**
 * External data gained a `period`, so a source can hold more than one record —
 * prior grades for semester 1 and semester 2 side by side rather than the second
 * import overwriting the first. A plain ADD COLUMN: existing rows keep NULL,
 * which still means "the one current record for this source".
 * Idempotent: skipped once the column exists.
 */
function migrateExternalDataPeriod(instance: Database.Database): void {
  const columns = instance.prepare("PRAGMA table_info(external_data)").all() as { name: string }[];
  if (columns.some((c) => c.name === "period")) return;
  instance.exec("ALTER TABLE external_data ADD COLUMN period TEXT");
}

/**
 * The course became free text (the teacher's own words, for both programmes)
 * instead of one hard-coded marker. The old marker becomes its name, and a DP
 * class, which was always labelled AI SL before a course could be typed, keeps
 * that label. Runs once, recorded in app_settings: a DP class left without a
 * course afterwards is the teacher's choice, not something to fill in again.
 */
function migrateCourseToFreeText(instance: Database.Database): void {
  const KEY = "migration:course-free-text";
  if (instance.prepare("SELECT 1 FROM app_settings WHERE key = ?").get(KEY)) return;
  instance.transaction(() => {
    instance.exec("UPDATE classes SET course = 'Financial Math' WHERE course = 'financial_math'");
    instance.exec("UPDATE classes SET course = 'AI SL' WHERE programme = 'DP' AND course IS NULL");
    instance.prepare("INSERT INTO app_settings (key, value) VALUES (?, 'done')").run(KEY);
  })();
}

function migrateForFinancialMath(instance: Database.Database): void {
  const has = (table: string, column: string) =>
    (instance.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(
      (c) => c.name === column
    );
  if (!has("classes", "course")) instance.exec("ALTER TABLE classes ADD COLUMN course TEXT");
  if (!has("students", "modified")) {
    instance.exec("ALTER TABLE students ADD COLUMN modified INTEGER NOT NULL DEFAULT 0");
  }
  if (!has("questions", "variant")) {
    instance.exec(
      "ALTER TABLE questions ADD COLUMN variant TEXT CHECK (variant IS NULL OR variant IN ('standard', 'modified'))"
    );
  }
}

function initDb(): Database.Database {
  if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }

  const instance = new Database(DB_PATH);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");

  const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
  instance.exec(schema);

  // Rebuild migrations below DROP + rename tables that other tables still
  // reference (e.g. classes <- students, assessments <- questions, questions
  // <- transcripts/gradings). SQLite's FK enforcement would otherwise treat
  // the drop as a cascading DELETE and reject it, so checks are disabled for
  // this phase only (per SQLite's documented procedure for schema changes)
  // and restored immediately after. This pragma is a no-op mid-transaction,
  // so it must be toggled here, outside each migration's own transaction.
  instance.pragma("foreign_keys = OFF");
  migrateExternalDataCheck(instance);
  migrateClassesForDp(instance);
  migrateLearningTargetsGradeCheck(instance);
  migrateAssessmentsForDp(instance);
  migrateQuestionsForDp(instance);
  migrateSubmissionsForErrorScan(instance);
  migrateSubmissionsForSkillScan(instance);
  migrateAssessmentsForClassScope(instance);
  migrateAssessmentFilePaths(instance);
  migrateSheetMarksForKeptComparison(instance);
  migrateForFinancialMath(instance);
  migrateCourseToFreeText(instance);
  migrateExternalDataPeriod(instance);
  instance.pragma("foreign_keys = ON");

  seedStyleExamples(instance);

  return instance;
}

/** Returns the singleton SQLite connection, creating the file + schema on first call. */
export function getDb(): Database.Database {
  if (!db) {
    db = initDb();
  }
  return db;
}
