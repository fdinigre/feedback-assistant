import "server-only";

import { listExternalDataBySource } from "@/lib/db/queries";

/**
 * Everything imported about a student from outside this app — prior-year
 * grades, MAP, CAT4 — turned into something drawable.
 *
 * The hard part is that none of it has a schema. The import takes whatever
 * columns her spreadsheet had, and on this roster alone that is three different
 * shapes of MAP export and five of prior grades: criteria for MYP classes,
 * per-assessment grades like "3 (39%)" for the Diploma ones, and an older
 * import that predates semesters. So nothing here assumes a column exists.
 * Values are classified by what their key looks like, and anything unrecognised
 * is still shown — as a number or a line of text, never dropped and never given
 * a meaning it has not earned.
 */

export type Measure =
  /** 0-100, drawn as a filled bar. */
  | { kind: "percentile"; label: string; value: number }
  /** A MAP RIT or similar: a number on a known-ish scale. */
  | { kind: "score"; label: string; value: number; scale: [number, number] }
  /** A criterion level (out of 8) or a grade (out of 7). */
  | { kind: "level"; label: string; value: number; max: number }
  /** A signed number, drawn either side of a centre line. MAP strand scores. */
  | { kind: "delta"; label: string; value: number }
  | { kind: "text"; label: string; value: string };

export type PriorYear = {
  /** "2025-26 S1", or whatever the row called itself. */
  label: string;
  /** Sorts chronologically; rows with no period sort first. */
  sortKey: string;
  criteria: { criterion: string; level: number }[];
  finalGrade: number | null;
  /** Per-assessment grades on a Diploma or Financial Math year. */
  assessments: { label: string; grade: number; pct: number | null }[];
  /** Course, year group — whatever the sheet carried alongside. */
  notes: { label: string; value: string }[];
};

export type Background = {
  priorYears: PriorYear[];
  map: Measure[];
  cat4: Measure[];
  /** Metadata rows from the MAP export: the anonymised name, the course. */
  mapNotes: { label: string; value: string }[];
};

const METADATA = /^(anon name|course|year|semester|school year|percentile band)$/i;
const CRITERION = /^criterion\s+([A-D])$/i;
const GRADE_KEY = /final grade|eoy grade|prediction/i;
const PERCENTILE = /percentile/i;
const RIT = /\brit\b/i;
/** Every one of these is 0 on every row on file — the export never filled them. */
const EMPTY_FLAG = /^(met )?growth$/i;

function toNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** "3 (39%)" -> grade 3, 39%. A bare "3" parses too, with no percentage. */
function parseGradeWithPct(raw: string): { grade: number; pct: number | null } | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(?:\((\d+(?:\.\d+)?)\s*%\))?\s*$/.exec(raw);
  if (!match) return null;
  return { grade: Number(match[1]), pct: match[2] ? Number(match[2]) : null };
}

function classify(label: string, raw: unknown): Measure | null {
  if (raw == null || String(raw).trim() === "") return null;
  const text = String(raw).trim();

  if (METADATA.test(label)) return { kind: "text", label, value: text };

  const n = toNum(text);
  if (EMPTY_FLAG.test(label)) return n === 0 ? null : { kind: "text", label, value: text };

  const criterion = CRITERION.exec(label);
  if (criterion && n != null) {
    // 0 in these columns means "not assessed", not "a level of zero".
    return n === 0 ? null : { kind: "level", label, value: n, max: 8 };
  }
  if (GRADE_KEY.test(label) && n != null) {
    return n === 0 ? null : { kind: "level", label, value: n, max: 7 };
  }
  if (PERCENTILE.test(label) && n != null) return { kind: "percentile", label, value: n };
  if (RIT.test(label) && n != null) return { kind: "score", label, value: n, scale: [180, 280] };
  if (n != null) return { kind: "delta", label, value: n };
  return { kind: "text", label, value: text };
}

function measuresFrom(data: unknown): Measure[] {
  if (!data || typeof data !== "object") return [];
  const out: Measure[] = [];
  for (const [label, raw] of Object.entries(data as Record<string, unknown>)) {
    const measure = classify(label, raw);
    if (measure) out.push(measure);
  }
  return out;
}

function buildPriorYear(period: string | null, data: unknown): PriorYear {
  const record = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const criteria: PriorYear["criteria"] = [];
  const assessments: PriorYear["assessments"] = [];
  const notes: PriorYear["notes"] = [];
  let finalGrade: number | null = null;

  for (const [label, raw] of Object.entries(record)) {
    if (raw == null || String(raw).trim() === "") continue;
    const text = String(raw).trim();

    const criterion = CRITERION.exec(label);
    if (criterion) {
      const level = toNum(text);
      if (level && level > 0) criteria.push({ criterion: criterion[1].toUpperCase(), level });
      continue;
    }
    if (GRADE_KEY.test(label)) {
      const grade = toNum(text);
      if (grade && grade > 0) finalGrade = grade;
      continue;
    }
    if (METADATA.test(label)) {
      // Semester and school year are already in the period label above the card.
      if (!/^(semester|school year)$/i.test(label)) notes.push({ label, value: text });
      continue;
    }
    const parsed = parseGradeWithPct(text);
    if (parsed) assessments.push({ label, grade: parsed.grade, pct: parsed.pct });
    else notes.push({ label, value: text });
  }

  criteria.sort((a, b) => a.criterion.localeCompare(b.criterion));

  // An older import carried no period at all; it labelled itself in a "Year"
  // column instead, so use that rather than showing a card with no name on it.
  const yearNote = notes.find((nt) => /^year$/i.test(nt.label));
  return {
    label: period ?? yearNote?.value ?? "Earlier",
    sortKey: period ?? "",
    criteria,
    finalGrade,
    assessments,
    notes: notes.filter((nt) => !/^year$/i.test(nt.label)),
  };
}

export function computeBackground(studentId: number): Background {
  const priorRows = listExternalDataBySource(studentId, "PRIOR_GRADES");
  const mapRow = listExternalDataBySource(studentId, "MAP")[0] ?? null;
  const cat4Row = listExternalDataBySource(studentId, "CAT4")[0] ?? null;

  const priorYears = priorRows
    .map((row) => buildPriorYear(row.period, row.data))
    .filter((year) => year.criteria.length > 0 || year.finalGrade != null || year.assessments.length > 0)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const mapMeasures = measuresFrom(mapRow?.data);
  return {
    priorYears,
    map: mapMeasures.filter((m) => m.kind !== "text"),
    cat4: measuresFrom(cat4Row?.data).filter((m) => m.kind !== "text"),
    mapNotes: mapMeasures.flatMap((m) => (m.kind === "text" ? [{ label: m.label, value: m.value }] : [])),
  };
}
