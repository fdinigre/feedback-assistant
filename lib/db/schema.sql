-- MYP Math Feedback Assistant — SQLite schema
-- All CREATE statements are idempotent (safe to re-run on every app start).

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  grade INTEGER NOT NULL CHECK (grade IN (9, 10, 11, 12)),
  programme TEXT NOT NULL DEFAULT 'MYP' CHECK (programme IN ('MYP', 'DP')),
  dp_year INTEGER, -- 1 or 2, NULL for MYP; Year 1 = grade 11, Year 2 = grade 12
  course TEXT, -- the teacher's own name for the course ("AA HL", "Financial Math"); NULL if none
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  name TEXT NOT NULL,
  pseudonym TEXT NOT NULL UNIQUE,
  modified INTEGER NOT NULL DEFAULT 0, -- 1 = sits the modified variant of assessments that have one
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS external_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id),
  source TEXT NOT NULL, -- 'MAP' | 'CAT4' | 'PRIOR_GRADES' | 'ATL' (unrestricted: teacher's exports vary)
  -- Which record this is within its source, e.g. '2025-26 S1' for a semester of
  -- prior grades. NULL where a source holds one current record (MAP, CAT4, ATL),
  -- which is what re-importing replaces. Sorts chronologically as a string.
  period TEXT,
  data TEXT NOT NULL, -- JSON
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS learning_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grade INTEGER NOT NULL CHECK (grade IN (9, 10, 11, 12)),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (grade, name)
);

CREATE TABLE IF NOT EXISTS assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  class_id INTEGER REFERENCES classes(id), -- the class sitting this assessment; NULL = legacy grade-wide
  grade INTEGER NOT NULL CHECK (grade IN (9, 10, 11, 12)),
  criteria TEXT NOT NULL, -- JSON array, e.g. ["A"] or ["B","C"]; [] for DP
  date TEXT,
  name_mask TEXT, -- JSON NameMask {page,x,y,w,h} fractions of page
  status TEXT NOT NULL DEFAULT 'setup',
  programme TEXT NOT NULL DEFAULT 'MYP',
  assessment_type TEXT, -- DP: 'quiz' | 'unit_test'; Financial Math: 'fm_test' (points/total); NULL for MYP paper tests
  boundaries TEXT, -- JSON GradeBoundary[], NULL for MYP
  paper_file TEXT, -- DP: path to uploaded paper (PDF/.docx)
  markscheme_file TEXT, -- DP: path to uploaded official markscheme (PDF/.docx)
  cover_targets TEXT, -- JSON string[] — learning targets parsed from the cover page
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id),
  number TEXT NOT NULL,
  max_points REAL NOT NULL,
  level_band TEXT CHECK (level_band IS NULL OR level_band IN ('1-2', '3-4', '5-6', '7-8')), -- NULL for DP
  learning_target_id INTEGER REFERENCES learning_targets(id),
  dp_scheme TEXT, -- JSON DpQuestionScheme, NULL for MYP
  variant TEXT CHECK (variant IS NULL OR variant IN ('standard', 'modified')), -- NULL = every student sits it
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS level_thresholds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id),
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 8),
  min_points REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (assessment_id, level)
);

CREATE TABLE IF NOT EXISTS worked_solutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id),
  question_id INTEGER REFERENCES questions(id), -- NULL = whole-assessment notes
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rubrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id),
  criterion TEXT NOT NULL, -- 'B', 'C' or 'D'
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id),
  student_id INTEGER REFERENCES students(id),
  pdf_path TEXT,
  page_count INTEGER,
  scratch_pages TEXT, -- JSON int array
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'assigned', 'transcribed', 'graded', 'reviewed', 'absent')),
  warnings TEXT, -- JSON string array
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transcripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id),
  question_id INTEGER NOT NULL REFERENCES questions(id),
  content TEXT NOT NULL, -- JSON TranscriptQuestion
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (submission_id, question_id)
);

CREATE TABLE IF NOT EXISTS gradings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id),
  question_id INTEGER NOT NULL REFERENCES questions(id),
  content TEXT NOT NULL, -- JSON GradingQuestion
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (submission_id, question_id)
);

-- The marks sheet the teacher uploaded for an assessment. It stays, with its
-- comparison, until the teacher deletes it or uploads another in its place.
CREATE TABLE IF NOT EXISTS marks_sheets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL UNIQUE REFERENCES assessments(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  summary TEXT NOT NULL, -- JSON MarksUploadSummary
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The teacher's own mark from that sheet, kept only where it differed from the
-- app's mark at upload. Settling a difference records the choice rather than
-- removing the row, so the comparison stays readable afterwards.
-- Cascades so deleting a submission or question needs no extra cleanup.
CREATE TABLE IF NOT EXISTS sheet_marks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  points REAL NOT NULL,
  from_blank INTEGER NOT NULL DEFAULT 0, -- 1 = the sheet cell was empty, read as zero
  app_points REAL, -- the app's mark when the sheet was uploaded
  resolution TEXT CHECK (resolution IS NULL OR resolution IN ('mine', 'app')), -- NULL = still waiting
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (submission_id, question_id)
);

CREATE TABLE IF NOT EXISTS criterion_levels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id),
  criterion TEXT NOT NULL,
  level_proposed INTEGER NOT NULL,
  level_conservative INTEGER NOT NULL,
  level_final INTEGER,
  evidence TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (submission_id, criterion)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL UNIQUE REFERENCES submissions(id),
  sections TEXT NOT NULL, -- JSON ReportSections
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS style_examples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('comment', 'report')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purpose TEXT NOT NULL,
  prompt_file TEXT NOT NULL,
  response_file TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- IBDP: per-submission grade result (percentage -> grade 1-7 via boundaries)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dp_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL UNIQUE REFERENCES submissions(id),
  total_marks REAL NOT NULL,
  max_marks REAL NOT NULL,
  pct REAL NOT NULL,
  grade INTEGER NOT NULL,
  grade_final INTEGER, -- teacher override from review, NULL until adjusted
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- IA (Mathematical Exploration): milestones, documents, feedback/marks
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ia_deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  milestone TEXT NOT NULL,
  due_date TEXT NOT NULL,
  UNIQUE (class_id, milestone)
);

CREATE TABLE IF NOT EXISTS ia_explorations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL UNIQUE REFERENCES students(id),
  topic TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ia_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exploration_id INTEGER NOT NULL REFERENCES ia_explorations(id),
  milestone TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (exploration_id, milestone)
);

CREATE TABLE IF NOT EXISTS ia_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exploration_id INTEGER NOT NULL REFERENCES ia_explorations(id),
  kind TEXT NOT NULL CHECK (kind IN ('draft', 'final')),
  file_path TEXT,
  text TEXT, -- pseudonymized extracted text
  original_name TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ia_outputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exploration_id INTEGER NOT NULL REFERENCES ia_explorations(id),
  kind TEXT NOT NULL CHECK (kind IN ('draft_feedback', 'final_marks')),
  content TEXT NOT NULL, -- JSON IaDraftFeedback | IaFinalMarks
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS marking_instructions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL CHECK (scope IN ('standing', 'assessment')),
  programme TEXT, -- 'MYP' | 'DP' | NULL (standing only; NULL = every programme)
  assessment_id INTEGER REFERENCES assessments(id), -- set when scope = 'assessment'
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- app_settings — small editable singletons (key -> value), e.g. the teacher's
-- personal IA checklist that feeds the exploration prompts.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- rubric_descriptors / descriptor_checks — the tick-off breakdown of a
-- criterion's band descriptors (B/C/D). A band descriptor is compound ("describe
-- the patterns as general rules. Verify and justify their validity"), so one
-- level hides several judgements; each strand is a row here, judged per student.
-- Criterion A is not involved: its level follows from points and thresholds.
-- ---------------------------------------------------------------------------

-- One requirement of one band, as printed on the task. `strand` is the paper's
-- own label ("i", "ii") where it has one, which is what lets a band be compared
-- with the one above it. `position` only orders rows: it is deliberately NOT part
-- of a UNIQUE key, so reordering never collides and never has to swap row
-- contents between ids — a descriptor's id is what a student's tick hangs off.
CREATE TABLE IF NOT EXISTS rubric_descriptors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id),
  criterion TEXT NOT NULL, -- 'B' | 'C' | 'D'
  band TEXT NOT NULL CHECK (band IN ('1-2', '3-4', '5-6', '7-8')),
  strand TEXT, -- 'i', 'ii', ... as printed; NULL when the rubric labels none
  position INTEGER NOT NULL,
  text TEXT NOT NULL, -- the official "the student is able to..." statement
  student_text TEXT, -- the student-facing wording, where the task prints one
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Whether one student met one descriptor. met_proposed is the AI's judgement and
-- is NULL when it did not judge that descriptor at all, which is not the same as
-- "not met"; met_final is the teacher's override, NULL until she sets one — the
-- same shape as criterion_levels.level_final. text_at_check records the wording
-- the judgement was made against, so rewording a descriptor afterwards cannot
-- silently re-attribute old evidence to new text.
-- Cascades so deleting a submission or a descriptor needs no extra cleanup.
CREATE TABLE IF NOT EXISTS descriptor_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  descriptor_id INTEGER NOT NULL REFERENCES rubric_descriptors(id) ON DELETE CASCADE,
  met_proposed INTEGER, -- 1 met / 0 not met / NULL not judged
  met_final INTEGER, -- NULL = no teacher override
  evidence TEXT NOT NULL,
  text_at_check TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (submission_id, descriptor_id)
);

-- ---------------------------------------------------------------------------
-- class_plans / class_plan_entries — the daily plan a class follows for the
-- year, imported from the teacher's own spreadsheet. Assessments are created
-- here only when they are about to be graded, so this is the one place the app
-- can learn what is still ahead of a student.
-- ---------------------------------------------------------------------------

-- One upload receipt per class: which file, which academic year, when.
-- Lesson counts and the date range are COUNT/MIN/MAX over the entries.
CREATE TABLE IF NOT EXISTS class_plans (
  class_id INTEGER PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  start_year INTEGER NOT NULL, -- the August the academic year opens in
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row of the plan. A row spanning several days keeps both ends. `kind` tells
-- a lesson from a school break, which the planner writes as a row merged across
-- every column.
CREATE TABLE IF NOT EXISTS class_plan_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  date TEXT NOT NULL, -- ISO, the first day covered
  end_date TEXT, -- ISO, the last
  kind TEXT NOT NULL DEFAULT 'lesson' CHECK (kind IN ('lesson', 'break')),
  lesson_no TEXT,
  unit TEXT,
  topic TEXT NOT NULL,
  resources TEXT,
  note TEXT,
  criteria TEXT NOT NULL DEFAULT '[]', -- JSON Criterion[], read off the topic
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Which kinds of mistake a question lost marks to, against the closed list in
-- lib/errors/taxonomy.ts. One row per (question, mechanism): a question can show
-- more than one. Cascades on the submission so re-grading or deleting a paper
-- never leaves tags behind pointing at nothing.
-- NOTE: submissions.error_tags_scanned_at is added by migrateSubmissionsForErrorScan
-- in lib/db/index.ts for databases created before error tagging existed.

CREATE TABLE IF NOT EXISTS question_error_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  mechanism TEXT NOT NULL,
  -- The phrase in the marking evidence that put it here, so a count can always
  -- be traced back to the sentence behind it.
  quote TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (submission_id, question_id, mechanism)
);

CREATE INDEX IF NOT EXISTS idx_question_error_tags_submission
  ON question_error_tags (submission_id);

-- Which core skill (lib/errors/core-skills.ts) a question lost marks in: the
-- other axis from the mechanism above, the WHAT rather than the HOW, and the one
-- that recurs from unit to unit. Written by the same classifier pass.
-- NOTE: submissions.skill_tags_scanned_at is added by migrateSubmissionsForSkillScan
-- in lib/db/index.ts, for the same reason as error_tags_scanned_at.

CREATE TABLE IF NOT EXISTS question_skill_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  skill TEXT NOT NULL,
  quote TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (submission_id, question_id, skill)
);

CREATE INDEX IF NOT EXISTS idx_question_skill_tags_submission
  ON question_skill_tags (submission_id);

-- An evening of parent meetings, in the order they are scheduled. Pasted or
-- uploaded once, then walked through: each meeting links to that student's
-- conference page and the page walks forward through this order.
CREATE TABLE IF NOT EXISTS conference_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,              -- ISO, the day of the meetings
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conference_meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES conference_sessions(id) ON DELETE CASCADE,
  -- NULL where the pasted name matched nobody: the meeting is still real and
  -- still has to appear in the running order, it just has no page to open.
  student_id INTEGER REFERENCES students(id),
  position INTEGER NOT NULL,
  at_time TEXT,                    -- "16:20", where the schedule carried one
  parent_name TEXT,
  raw_name TEXT NOT NULL,          -- what the schedule said, kept verbatim
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conference_meetings_session
  ON conference_meetings (session_id, position);

-- Another name the same student is written under elsewhere. The school's
-- systems and the teacher's roster disagree often enough that this is routine:
-- a nickname ("Bobby" for Robert), a different first name (a middle name the
-- school uses where the roster has the first), a middle name present or missing.
--
-- UNIQUE on the alias, because one written name must not resolve to two
-- children — that is the mistake this whole area exists to prevent.
CREATE TABLE IF NOT EXISTS student_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  source TEXT,                     -- where it was seen, e.g. 'conference schedule'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (alias)
);
