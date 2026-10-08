// Compare the tool's marks against the teacher's answer key and print an accuracy report.
// Run AFTER benchmark-run: npx tsx --conditions=react-server scripts/benchmark-compare.mts 5
import fs from "node:fs";
import {
  listSubmissions,
  listQuestions,
  listGradings,
  listLevelThresholds,
  getStudent,
} from "@/lib/db/queries";
import { computeLevel } from "@/lib/pipeline/grade";

const assessmentId = Number(process.argv[2] ?? "5");
const KEY_CSV = "data/benchmark/g9-std-quiz-key.csv";

// ---- load teacher key ----
const lines = fs.readFileSync(KEY_CSV, "utf-8").trim().split("\n");
const header = lines[0].split(",");
const qCols = header.slice(1); // Q1..Q9
const key = new Map<string, Record<string, number>>();
for (const line of lines.slice(1)) {
  const cells = line.split(",");
  const name = cells[0].trim();
  const row: Record<string, number> = {};
  qCols.forEach((q, i) => (row[q] = Number(cells[i + 1] ?? 0)));
  key.set(name.toLowerCase(), row);
}

// Map a tool question number to the key's column bucket (9a/9b/9c -> Q9, etc.).
function bucket(num: string): string {
  const n = num.trim().toLowerCase();
  if (n.startsWith("9")) return "Q9";
  return "Q" + n;
}

const questions = listQuestions(assessmentId);
const bandOf = new Map(questions.map((q) => [q.number.trim(), q.level_band]));
const thresholds = listLevelThresholds(assessmentId);
const BANDCOLS: Record<string, string[]> = {
  "1-2": ["Q1", "Q2"],
  "3-4": ["Q3", "Q4a", "Q4b", "Q4c"],
  "5-6": ["Q5", "Q6", "Q7a", "Q7b", "Q7c"],
  "7-8": ["Q8", "Q9"],
};
function bandsFrom(points: Record<string, number>): Map<string, number> {
  const m = new Map<string, number>();
  for (const [band, cols] of Object.entries(BANDCOLS)) {
    m.set(band, cols.reduce((s, c) => s + (points[c] ?? 0), 0));
  }
  return m;
}

const subs = listSubmissions(assessmentId).filter((s) => s.student_id != null && s.status !== "absent");

// per-question aggregates
const perQ: Record<string, { consExact: number; propExact: number; consErr: number; propErr: number; n: number }> = {};
for (const q of qCols) perQ[q] = { consExact: 0, propExact: 0, consErr: 0, propErr: 0, n: 0 };
let aMatchCons = 0, aMatchProp = 0, aCounted = 0;
const rows: string[] = [];
let compared = 0;

for (const sub of subs) {
  const name = getStudent(sub.student_id as number)?.name ?? "";
  const k = key.get(name.toLowerCase());
  if (!k) { rows.push(`(no key) ${name}`); continue; }
  const gradings = listGradings(sub.id);
  if (gradings.length === 0) { rows.push(`(not graded) ${name}`); continue; }
  compared++;

  const cons: Record<string, number> = {};
  const prop: Record<string, number> = {};
  for (const q of qCols) { cons[q] = 0; prop[q] = 0; }
  for (const g of gradings) {
    const q = questions.find((x) => x.id === g.question_id);
    if (!q) continue;
    const b = bucket(q.number);
    const c = g.content as { proposedPoints?: number; conservativePoints?: number; finalPoints?: number | null };
    const consPts = c.finalPoints ?? c.conservativePoints ?? 0;
    const propPts = c.proposedPoints ?? 0;
    if (b in cons) { cons[b] += consPts; prop[b] += propPts; }
  }

  for (const q of qCols) {
    const truth = k[q] ?? 0;
    perQ[q].n++;
    if (cons[q] === truth) perQ[q].consExact++;
    if (prop[q] === truth) perQ[q].propExact++;
    perQ[q].consErr += Math.abs(cons[q] - truth);
    perQ[q].propErr += Math.abs(prop[q] - truth);
  }

  const aTruth = computeLevel(bandsFrom(k), thresholds);
  const aCons = computeLevel(bandsFrom(cons), thresholds);
  const aProp = computeLevel(bandsFrom(prop), thresholds);
  aCounted++;
  if (aCons === aTruth) aMatchCons++;
  if (aProp === aTruth) aMatchProp++;
  rows.push(`${name.padEnd(20)} A: key=${aTruth} cons=${aCons} prop=${aProp}  ${aCons === aTruth ? "" : "  <-- A DIFF"}`);
}

console.log(`\n=== Per-student Criterion A (key vs tool) — ${compared} students ===`);
rows.forEach((r) => console.log(r));

console.log(`\n=== Per-question exact-match rate (n=${compared}) ===`);
console.log("Q      conservative     proposed      (mean abs err: cons / prop)");
for (const q of qCols) {
  const p = perQ[q];
  if (p.n === 0) continue;
  console.log(
    `${q.padEnd(6)} ${String(p.consExact + "/" + p.n).padEnd(16)} ${String(p.propExact + "/" + p.n).padEnd(13)} ${(p.consErr / p.n).toFixed(2)} / ${(p.propErr / p.n).toFixed(2)}`
  );
}
const totCons = qCols.reduce((s, q) => s + perQ[q].consExact, 0);
const totProp = qCols.reduce((s, q) => s + perQ[q].propExact, 0);
const totN = qCols.reduce((s, q) => s + perQ[q].n, 0);
console.log(`\nOverall per-question exact: conservative ${totCons}/${totN} (${(100*totCons/totN).toFixed(0)}%), proposed ${totProp}/${totN} (${(100*totProp/totN).toFixed(0)}%)`);
console.log(`Criterion A level match: conservative ${aMatchCons}/${aCounted}, proposed ${aMatchProp}/${aCounted}`);
