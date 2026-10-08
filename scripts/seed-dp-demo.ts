/**
 * Seeds static DP demo data — a class, two obviously-fake students, one DP
 * unit test with a realistic two-question markscheme (M1/(M1)/A1/R1/ft +
 * Notes), 7-band grade boundaries, and gradings/dp_results for both
 * students — so the DP review screen (app/submissions/[id]/**) and the DP
 * xlsx export (app/api/export/assessment/[id]/xlsx) can be exercised
 * end-to-end. No AI calls: every value below is hand-written and static.
 *
 * Run:   npx tsx scripts/seed-dp-demo.ts
 * Undo:  npx tsx scripts/cleanup-dp-demo.ts
 *
 * Writes raw SQL against data/app.db instead of going through
 * lib/db/queries.ts, because that module (and lib/submissions/dp-grading.ts)
 * starts with `import "server-only"`, which throws unconditionally when
 * loaded outside a Next.js server-component bundle — a plain tsx/node
 * script can't import it. Column names and JSON shapes below mirror
 * lib/db/queries.ts exactly so every row this script inserts reads back
 * correctly through the app's normal query helpers and UI.
 *
 * Every created row's id is recorded to data/tmp/dp-demo-seed.json so
 * scripts/cleanup-dp-demo.ts can remove precisely what this script made.
 */
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import type {
  DpGradingQuestion,
  DpQuestionScheme,
  GradeBoundary,
  TranscriptQuestion,
} from "../lib/types";
import {
  buildMarkValueMap,
  computeDpGrade,
  pctOf,
  pickFinal,
  sumQuestionMarks,
  sumSubmissionMarks,
} from "../lib/submissions/dp-calc";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "app.db");
const SCHEMA_PATH = path.join(ROOT, "lib", "db", "schema.sql");
const TMP_DIR = path.join(DATA_DIR, "tmp");
const SEED_RECORD_PATH = path.join(TMP_DIR, "dp-demo-seed.json");

const CLASS_NAME = "DP DEMO (delete me)";
const STUDENT_NAMES = ["Demo Student One", "Demo Student Two"];
const ASSESSMENT_TITLE = "DP Demo Unit Test (delete me)";

const BOUNDARIES: GradeBoundary[] = [
  { grade: 1, minPct: 0 },
  { grade: 2, minPct: 20 },
  { grade: 3, minPct: 35 },
  { grade: 4, minPct: 50 },
  { grade: 5, minPct: 63 },
  { grade: 6, minPct: 75 },
  { grade: 7, minPct: 87 },
];

function q1Scheme(): DpQuestionScheme {
  return {
    totalMarks: 6,
    subparts: [
      {
        label: "a",
        maxMarks: 3,
        scheme: "f(x) = (3x^2 + 1)^3. Find f'(x) and f'(1).",
        notes: ["Award M0A0A0 if the chain rule is not attempted."],
        marks: [
          {
            id: "q1a-m1",
            code: "M1",
            implied: false,
            ft: false,
            value: 1,
            descriptor: "attempt to differentiate using the chain rule",
          },
          {
            id: "q1a-a1",
            code: "A1",
            implied: false,
            ft: false,
            value: 1,
            descriptor: "f'(x) = 18x(3x^2 + 1)^2",
          },
          {
            id: "q1a-a1b",
            code: "A1",
            implied: false,
            ft: false,
            value: 1,
            descriptor: "f'(1) = 288 (3 s.f. or exact)",
          },
        ],
      },
      {
        label: "b",
        maxMarks: 3,
        scheme: "Find the equation of the tangent to the curve at x = 1.",
        notes: [],
        marks: [
          {
            id: "q1b-m1",
            code: "M1",
            implied: false,
            ft: false,
            value: 1,
            descriptor: "attempt to substitute their gradient into y - y1 = m(x - x1)",
          },
          {
            id: "q1b-im1",
            code: "M1",
            implied: true,
            ft: false,
            value: 1,
            descriptor: "(M1) for correct point (1, 64) used",
          },
          {
            id: "q1b-a1ft",
            code: "A1",
            implied: false,
            ft: true,
            value: 1,
            descriptor: "correct equation y = 288x - 224 (ft their gradient from (a))",
          },
        ],
      },
    ],
  };
}

function q2Scheme(): DpQuestionScheme {
  return {
    totalMarks: 6,
    subparts: [
      {
        label: "a",
        maxMarks: 2,
        scheme: "Solve 2 sin(x) = 1 for 0 <= x <= 2*pi, explaining the number of solutions.",
        notes: ["Do not award R0A1 — the reasoning mark is a prerequisite for the accuracy mark."],
        marks: [
          {
            id: "q2a-r1",
            code: "R1",
            implied: false,
            ft: false,
            value: 1,
            descriptor: "recognises two solutions in range from the sine graph / CAST",
          },
          {
            id: "q2a-a1",
            code: "A1",
            implied: false,
            ft: false,
            value: 1,
            descriptor: "correct reasoning stated (sine positive in quadrants I and II)",
          },
        ],
      },
      {
        label: "b",
        maxMarks: 4,
        scheme: "Hence find both solutions.",
        notes: ["Accept 1000 = 1,000 and 1,9 = 1.9 notation equally."],
        marks: [
          {
            id: "q2b-m1",
            code: "M1",
            implied: false,
            ft: false,
            value: 1,
            descriptor: "attempt to find x = arcsin(0.5)",
          },
          {
            id: "q2b-a1",
            code: "A1",
            implied: false,
            ft: false,
            value: 1,
            descriptor: "x = pi/6 (0.524 to 3 s.f.)",
          },
          {
            id: "q2b-a1b",
            code: "A1",
            implied: false,
            ft: false,
            value: 1,
            descriptor: "x = 5*pi/6 (2.62 to 3 s.f.)",
          },
          {
            id: "q2b-a1c",
            code: "A1",
            implied: false,
            ft: false,
            value: 1,
            descriptor: "both solutions given to at least 3 s.f. or exact",
          },
        ],
      },
    ],
  };
}

function transcriptFor(questionNumber: string, steps: string[]): TranscriptQuestion {
  return {
    questionNumber,
    steps: steps.map((text) => ({ text, confident: true })),
    illegible: [],
    blank: false,
  };
}

function award(
  markId: string,
  code: string,
  awarded: boolean,
  conservativeAwarded: boolean,
  evidence: string,
  note?: string
) {
  return { markId, code, awarded, conservativeAwarded, evidence, ...(note ? { note } : {}) };
}

/** Demo Student One — strong: one first-pass/conservative disagreement (Q1 (a) final mark) and one ambiguity flag. */
function studentOneGrading(): { q1: DpGradingQuestion; q2: DpGradingQuestion } {
  const q1: DpGradingQuestion = {
    subparts: [
      {
        label: "a",
        flags: [
          "Answer correct but the intermediate line 3(4)^2 x 6 was skipped — check if this counts as adequate working.",
        ],
        awards: [
          award("q1a-m1", "M1", true, true, "wrote d/dx[(3x^2+1)^3] = 3(3x^2+1)^2 * 6x"),
          award("q1a-a1", "A1", true, true, "18x(3x^2+1)^2 shown"),
          award(
            "q1a-a1b",
            "A1",
            true,
            false,
            "f'(1) = 288 stated with no intermediate arithmetic shown",
            "Conservative pass: value not re-verified against the shown working."
          ),
        ],
      },
      {
        label: "b",
        flags: [],
        awards: [
          award("q1b-m1", "M1", true, true, "substituted gradient 288 into y - 64 = 288(x - 1)"),
          award("q1b-im1", "M1", true, true, "point (1, 64) implicit in the substitution shown"),
          award("q1b-a1ft", "A1", true, true, "y = 288x - 224"),
        ],
      },
    ],
    totalAwarded: 0,
  };
  const q2: DpGradingQuestion = {
    subparts: [
      {
        label: "a",
        flags: [],
        awards: [
          award("q2a-r1", "R1", true, true, "sketched the sine graph and marked two crossings in range"),
          award("q2a-a1", "A1", true, true, "sine positive in quadrants I and II, per CAST"),
        ],
      },
      {
        label: "b",
        flags: [],
        awards: [
          award("q2b-m1", "M1", true, true, "x = arcsin(0.5) attempted"),
          award("q2b-a1", "A1", true, true, "x = pi/6"),
          award("q2b-a1b", "A1", true, true, "x = 5pi/6"),
          award("q2b-a1c", "A1", true, true, "both given exactly as multiples of pi"),
        ],
      },
    ],
    totalAwarded: 0,
  };
  return { q1, q2 };
}

/** Demo Student Two — weaker: an early slip in Q1(a) follow-throughed correctly in Q1(b) (ft), and one part of Q2(b) missed. */
function studentTwoGrading(): { q1: DpGradingQuestion; q2: DpGradingQuestion } {
  const q1: DpGradingQuestion = {
    subparts: [
      {
        label: "a",
        flags: [],
        awards: [
          award("q1a-m1", "M1", true, true, "attempted the chain rule: d/dx[(3x^2+1)^3]"),
          award(
            "q1a-a1",
            "A1",
            false,
            false,
            "wrote 6x(3x^2+1)^2 — dropped the outer exponent's factor of 3"
          ),
          award("q1a-a1b", "A1", false, false, "f'(1) = 96 (carries the error from the previous line)"),
        ],
      },
      {
        label: "b",
        flags: [],
        awards: [
          award("q1b-m1", "M1", true, true, "substituted their gradient of 96 into the tangent formula"),
          award("q1b-im1", "M1", false, false, "point (1, 64) not shown explicitly"),
          award(
            "q1b-a1ft",
            "A1",
            true,
            true,
            "y = 96x - 32 — correctly follows through from their gradient of 96 (spec P8 ft rule)"
          ),
        ],
      },
    ],
    totalAwarded: 0,
  };
  const q2: DpGradingQuestion = {
    subparts: [
      {
        label: "a",
        flags: [],
        awards: [
          award("q2a-r1", "R1", true, true, "stated 'two solutions in range'"),
          award("q2a-a1", "A1", false, false, "no reasoning given for why there are two solutions"),
        ],
      },
      {
        label: "b",
        flags: [],
        awards: [
          award("q2b-m1", "M1", true, true, "x = arcsin(0.5) attempted"),
          award("q2b-a1", "A1", true, true, "x = pi/6"),
          award("q2b-a1b", "A1", false, false, "second solution (5pi/6) not given — only one root stated"),
          award("q2b-a1c", "A1", false, false, "precision/second solution requirement not met"),
        ],
      },
    ],
    totalAwarded: 0,
  };
  return { q1, q2 };
}

function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(fs.readFileSync(SCHEMA_PATH, "utf-8")); // idempotent (CREATE TABLE IF NOT EXISTS)

  const record: {
    classId: number;
    studentIds: number[];
    assessmentId: number;
    questionIds: number[];
    submissionIds: number[];
    learningTargetIdsCreated: number[];
  } = {
    classId: -1,
    studentIds: [],
    assessmentId: -1,
    questionIds: [],
    submissionIds: [],
    learningTargetIdsCreated: [],
  };

  const seed = db.transaction(() => {
    // --- class -------------------------------------------------------
    const classResult = db
      .prepare("INSERT INTO classes (name, grade, programme, dp_year) VALUES (?, 12, 'DP', 2)")
      .run(CLASS_NAME);
    record.classId = classResult.lastInsertRowid as number;

    // --- students ------------------------------------------------------
    const insertStudent = db.prepare(
      "INSERT INTO students (class_id, name, pseudonym) VALUES (?, ?, ?)"
    );
    const pseudonymExists = db.prepare("SELECT 1 FROM students WHERE pseudonym = ?");
    function freshPseudonym(): string {
      let candidate: string;
      do {
        const digits = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
        candidate = `S-DEMO-${digits}`;
      } while (pseudonymExists.get(candidate));
      return candidate;
    }
    for (const name of STUDENT_NAMES) {
      const result = insertStudent.run(record.classId, name, freshPseudonym());
      record.studentIds.push(result.lastInsertRowid as number);
    }

    // --- learning targets (reuse if they already exist for grade 12) ---
    const targetNames = ["Differentiation and applications", "Trigonometric equations and identities"];
    const targetIds: number[] = [];
    for (const name of targetNames) {
      const existing = db
        .prepare("SELECT id FROM learning_targets WHERE grade = 12 AND name = ?")
        .get(name) as { id: number } | undefined;
      if (existing) {
        targetIds.push(existing.id);
      } else {
        const result = db
          .prepare("INSERT INTO learning_targets (grade, name) VALUES (12, ?)")
          .run(name);
        const id = result.lastInsertRowid as number;
        targetIds.push(id);
        record.learningTargetIdsCreated.push(id);
      }
    }

    // --- assessment ------------------------------------------------------
    const assessmentResult = db
      .prepare(
        `INSERT INTO assessments
           (title, grade, criteria, date, status, programme, assessment_type, boundaries, cover_targets)
         VALUES (?, 12, '[]', date('now'), 'review', 'DP', 'unit_test', ?, ?)`
      )
      .run(ASSESSMENT_TITLE, JSON.stringify(BOUNDARIES), JSON.stringify(targetNames));
    record.assessmentId = assessmentResult.lastInsertRowid as number;

    // --- questions ------------------------------------------------------
    const insertQuestion = db.prepare(
      `INSERT INTO questions (assessment_id, number, max_points, level_band, learning_target_id, dp_scheme)
       VALUES (@assessment_id, @number, @max_points, NULL, @learning_target_id, @dp_scheme)`
    );
    const q1Result = insertQuestion.run({
      assessment_id: record.assessmentId,
      number: "1",
      max_points: 6,
      learning_target_id: targetIds[0],
      dp_scheme: JSON.stringify(q1Scheme()),
    });
    const q1Id = q1Result.lastInsertRowid as number;
    const q2Result = insertQuestion.run({
      assessment_id: record.assessmentId,
      number: "2",
      max_points: 6,
      learning_target_id: targetIds[1],
      dp_scheme: JSON.stringify(q2Scheme()),
    });
    const q2Id = q2Result.lastInsertRowid as number;
    record.questionIds = [q1Id, q2Id];

    // --- submissions + transcripts + gradings + dp_results -------------
    const insertSubmission = db.prepare(
      `INSERT INTO submissions (assessment_id, student_id, pdf_path, page_count, status)
       VALUES (?, ?, NULL, NULL, 'graded')`
    );
    const insertTranscript = db.prepare(
      `INSERT INTO transcripts (submission_id, question_id, content) VALUES (?, ?, ?)`
    );
    const insertGrading = db.prepare(
      `INSERT INTO gradings (submission_id, question_id, content) VALUES (?, ?, ?)`
    );
    const insertDpResult = db.prepare(
      `INSERT INTO dp_results (submission_id, total_marks, max_marks, pct, grade, grade_final)
       VALUES (@submission_id, @total_marks, @max_marks, @pct, @grade, @grade_final)`
    );

    const questionsForCalc = [
      { id: q1Id, max_points: 6, dp_scheme: q1Scheme() },
      { id: q2Id, max_points: 6, dp_scheme: q2Scheme() },
    ];

    const perStudent = [
      {
        name: STUDENT_NAMES[0],
        studentId: record.studentIds[0],
        grading: studentOneGrading(),
        q1Steps: [
          "f(x) = (3x^2+1)^3",
          "f'(x) = 3(3x^2+1)^2 * 6x = 18x(3x^2+1)^2",
          "f'(1) = 18(1)(4)^2 = 288",
        ],
        q2Steps: ["2 sin(x) = 1 -> sin(x) = 0.5", "sin positive in QI and QII", "x = pi/6, x = 5pi/6"],
      },
      {
        name: STUDENT_NAMES[1],
        studentId: record.studentIds[1],
        grading: studentTwoGrading(),
        q1Steps: ["f(x) = (3x^2+1)^3", "f'(x) = 6x(3x^2+1)^2", "f'(1) = 96"],
        q2Steps: ["2 sin(x) = 1 -> sin(x) = 0.5", "x = pi/6"],
      },
    ];

    for (const student of perStudent) {
      const subResult = insertSubmission.run(record.assessmentId, student.studentId);
      const submissionId = subResult.lastInsertRowid as number;
      record.submissionIds.push(submissionId);

      insertTranscript.run(
        submissionId,
        q1Id,
        JSON.stringify(transcriptFor("1", student.q1Steps))
      );
      insertTranscript.run(
        submissionId,
        q2Id,
        JSON.stringify(transcriptFor("2", student.q2Steps))
      );

      const gradingByQuestionId = new Map<number, DpGradingQuestion>([
        [q1Id, student.grading.q1],
        [q2Id, student.grading.q2],
      ]);

      // totalAwarded per question, computed the same way the review API does.
      for (const [questionId, content] of gradingByQuestionId) {
        const scheme = questionId === q1Id ? q1Scheme() : q2Scheme();
        content.totalAwarded = sumQuestionMarks(content, scheme, pickFinal);
        insertGrading.run(submissionId, questionId, JSON.stringify(content));
      }

      const { total, max } = sumSubmissionMarks(questionsForCalc, gradingByQuestionId, pickFinal);
      const pct = pctOf(total, max);
      const grade = computeDpGrade(pct, BOUNDARIES);
      insertDpResult.run({
        submission_id: submissionId,
        total_marks: total,
        max_marks: max,
        pct,
        grade,
        grade_final: grade,
      });

      console.log(
        `  ${student.name}: submission #${submissionId} — ${total}/${max} (${pct.toFixed(1)}%) -> grade ${grade}`
      );
    }
  });

  seed();

  fs.writeFileSync(SEED_RECORD_PATH, JSON.stringify(record, null, 2));

  console.log("\nDP demo seed complete.");
  console.log(`  Class:      #${record.classId} "${CLASS_NAME}"`);
  console.log(`  Students:   ${record.studentIds.map((id) => `#${id}`).join(", ")}`);
  console.log(`  Assessment: #${record.assessmentId} "${ASSESSMENT_TITLE}"`);
  console.log(`  Questions:  ${record.questionIds.map((id) => `#${id}`).join(", ")}`);
  console.log(`  Submissions:${record.submissionIds.map((id) => `#${id}`).join(", ")}`);
  console.log(`  Review URLs: ${record.submissionIds.map((id) => `/submissions/${id}`).join("  ")}`);
  console.log(`  Record written to ${SEED_RECORD_PATH}`);

  db.close();
}

main();
