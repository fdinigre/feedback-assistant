/**
 * Removes everything scripts/seed-dp-demo.ts created, using the ids it
 * recorded in data/tmp/dp-demo-seed.json. Deletes in FK-safe order (leaves
 * before roots) since data/app.db runs with `foreign_keys = ON`.
 *
 * Run: npx tsx scripts/cleanup-dp-demo.ts
 *
 * Learning targets are intentionally left alone — learning_targets is a
 * shared catalog table (per grade) that other assessments may already be
 * referencing, so this script only ever removes the class/students/
 * assessment/questions/submissions/gradings/transcripts/dp_results the seed
 * script made.
 */
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "app.db");
const TMP_DIR = path.join(DATA_DIR, "tmp");
const SEED_RECORD_PATH = path.join(TMP_DIR, "dp-demo-seed.json");

type SeedRecord = {
  classId: number;
  studentIds: number[];
  assessmentId: number;
  questionIds: number[];
  submissionIds: number[];
  learningTargetIdsCreated: number[];
};

function main() {
  if (!fs.existsSync(SEED_RECORD_PATH)) {
    console.log(`No seed record at ${SEED_RECORD_PATH} — nothing to clean up.`);
    return;
  }

  const record = JSON.parse(fs.readFileSync(SEED_RECORD_PATH, "utf-8")) as SeedRecord;

  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");

  const cleanup = db.transaction(() => {
    const inList = (ids: number[]) => ids.map(() => "?").join(",");

    if (record.submissionIds.length > 0) {
      db.prepare(`DELETE FROM dp_results WHERE submission_id IN (${inList(record.submissionIds)})`).run(
        ...record.submissionIds
      );
      db.prepare(`DELETE FROM gradings WHERE submission_id IN (${inList(record.submissionIds)})`).run(
        ...record.submissionIds
      );
      db.prepare(`DELETE FROM transcripts WHERE submission_id IN (${inList(record.submissionIds)})`).run(
        ...record.submissionIds
      );
      db.prepare(`DELETE FROM reports WHERE submission_id IN (${inList(record.submissionIds)})`).run(
        ...record.submissionIds
      );
      db.prepare(`DELETE FROM submissions WHERE id IN (${inList(record.submissionIds)})`).run(
        ...record.submissionIds
      );
    }

    if (record.questionIds.length > 0) {
      db.prepare(`DELETE FROM questions WHERE id IN (${inList(record.questionIds)})`).run(
        ...record.questionIds
      );
    }

    if (record.assessmentId >= 0) {
      db.prepare("DELETE FROM assessments WHERE id = ?").run(record.assessmentId);
    }

    if (record.studentIds.length > 0) {
      db.prepare(`DELETE FROM students WHERE id IN (${inList(record.studentIds)})`).run(
        ...record.studentIds
      );
    }

    if (record.classId >= 0) {
      db.prepare("DELETE FROM classes WHERE id = ?").run(record.classId);
    }
  });

  cleanup();
  db.close();

  fs.unlinkSync(SEED_RECORD_PATH);

  console.log("DP demo cleanup complete:");
  console.log(`  Removed class #${record.classId}, students ${record.studentIds.join(", ")}`);
  console.log(
    `  Removed assessment #${record.assessmentId}, questions ${record.questionIds.join(", ")}`
  );
  console.log(`  Removed submissions ${record.submissionIds.join(", ")} (+ their transcripts/gradings/dp_results)`);
  if (record.learningTargetIdsCreated.length > 0) {
    console.log(
      `  Left learning_targets ${record.learningTargetIdsCreated.join(", ")} in place (shared catalog table).`
    );
  }
}

main();
