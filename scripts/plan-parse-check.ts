/**
 * Prints what lib/plan/parse.ts makes of a daily-plan spreadsheet, so the parser
 * can be checked against the teacher's real planners before any of it is wired to
 * the database or a page. Reads only; writes nothing.
 *
 *   npx tsx scripts/plan-parse-check.ts "<path to .xlsx>" [startYear]
 *
 * With no path it looks for the four planners on the Desktop.
 */
import fs from "node:fs";
import path from "node:path";

import { parseYearPlan } from "../lib/plan/parse";

const DEFAULTS = [
  "Grade 9E/Grade9_Extended_Planner_2026-27 .xlsx",
  "G9 STD/0. Documentation/Daily plan - 202627 - G9.xlsx",
  "AI SL/00 Daily Plan MAI SL2 2026-27.xlsx",
  "12 TKS Financial Math/Financial Math 2026-27/00 Daily Plan Financial Math 2026-27.xlsx",
].map((p) => path.join(process.env.HOME ?? "", "Desktop", p));

async function report(file: string, startYear?: number): Promise<void> {
  console.log(`\n=== ${path.basename(file)}`);
  if (!fs.existsSync(file)) {
    console.log("   (not found)");
    return;
  }
  const plan = await parseYearPlan(fs.readFileSync(file), {
    fileName: path.basename(file),
    startYear,
  });

  const lessons = plan.entries.filter((e) => e.kind === "lesson");
  const breaks = plan.entries.filter((e) => e.kind === "break");
  const assessments = lessons.filter((e) => e.criteria.length > 0);
  const first = plan.entries[0];
  const last = plan.entries[plan.entries.length - 1];

  console.log(
    `   sheet "${plan.sheetName}" · year ${plan.startYear}${plan.yearFromFile ? " (from the file)" : " (inferred)"}`
  );
  console.log(
    `   ${lessons.length} lessons · ${breaks.length} breaks · ${assessments.length} with criteria · ${first?.date} -> ${last?.date}`
  );
  if (plan.skipped.length > 0) {
    console.log("   skipped:");
    for (const s of plan.skipped) console.log(`     row ${s.row}: "${s.cell}" — ${s.why}`);
  }
  if (plan.undated.length > 0) {
    console.log("   no readable date:");
    for (const u of plan.undated) console.log(`     row ${u.row}: "${u.text}"`);
  }
  console.log("   breaks:");
  for (const b of breaks) console.log(`     ${b.date} -> ${b.endDate ?? "—"}  ${b.topic}`);
  console.log("   first assessments with criteria:");
  for (const a of assessments.slice(0, 4)) {
    console.log(`     ${a.date}  ${a.topic}  [${a.criteria.join(", ")}]  unit=${a.unit ?? "—"}`);
  }
}

async function main(): Promise<void> {
  const [file, year] = process.argv.slice(2);
  const files = file ? [file] : DEFAULTS;
  for (const f of files) await report(f, year ? Number(year) : undefined);
}

void main();
