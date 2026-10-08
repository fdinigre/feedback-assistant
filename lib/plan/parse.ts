import { parseXlsxTable } from "@/lib/roster/xlsx";
import type { Criterion } from "@/lib/types";

/**
 * Reads a class's daily plan for the year out of the spreadsheet the teacher
 * already keeps, so the app can say what is coming up for a student. Assessments
 * are only ever created here when they are about to be graded, which makes the
 * assessments table a record of the past; the planner is the only place the
 * future exists.
 *
 * Her four planners come in two shapes — "Lesson No. / Date(s) / Day / Unit /
 * Topic / Resources / Notes" with yearless dates, and "Lesson # / Date / Weekday
 * / Rotation Day / Phase / Unit / Content / Notes & Key Dates" with full ones —
 * so columns are found by pattern rather than by name, which also discards the
 * rotation columns and the legend text parked in an unheaded column.
 */

export class PlanSheetError extends Error {}

export type PlanEntryKind = "lesson" | "break";

export type ParsedPlanEntry = {
  /** ISO date of the first day this row covers. */
  date: string;
  /** ISO date of the last, when the row spans several days. */
  endDate: string | null;
  kind: PlanEntryKind;
  lessonNo: string | null;
  unit: string | null;
  topic: string;
  resources: string | null;
  note: string | null;
  /** Criteria named in the topic, e.g. "End of unit test (A & C)" -> ["A", "C"]. */
  criteria: Criterion[];
};

export type SkippedRow = { row: number; cell: string; why: string };

export type ParsedPlan = {
  entries: ParsedPlanEntry[];
  sheetName: string;
  /** The August the academic year opens in. */
  startYear: number;
  /** True when every date carried its own year, so nothing had to be inferred. */
  yearFromFile: boolean;
  skipped: SkippedRow[];
  /** Rows with text where a date should be, e.g. "OCTOBER BREAK (Oct 20 - 23)". */
  undated: { row: number; text: string }[];
};

const SHEET = /daily\s*plan/i;

const COLUMNS = {
  date: /date/i,
  topic: /topic|content/i,
  unit: /unit|phase/i,
  lesson: /lesson/i,
  resources: /resource/i,
  note: /note/i,
} as const;

// "18.08.2026" — the year is in the cell, so nothing has to be inferred.
const DATED = /(\d{1,2})\.(\d{1,2})\.(\d{4})/g;
// "18.08", and the "18.08 - 19.08" / "14.10-15.10" / "20.04 -21.04" spellings.
const UNDATED = /(\d{1,2})\.(\d{1,2})(?!\.\d)/g;
// "OCTOBER BREAK (Oct 18 - 22)" — how the DP and Financial Math planners write a
// break, with a month name instead of a number and sometimes only one of them.
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH_DAY = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{1,2})|(\d{1,2})/gi;

/** The academic year an unyeared DD.MM belongs to: Aug-Dec open it, Jan-Jul close it. */
function academicYear(month: number, startYear: number): number {
  return month >= 8 ? startYear : startYear + 1;
}

function iso(day: number, month: number, year: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type ParsedDates = { start: string; end: string | null; leftover: string; hadYear: boolean };

/**
 * Pulls the dates out of a date cell, keeping whatever text is left over.
 *
 * Several rows carry prose in the same cell — "20.12 - 04.01  WINTER BREAK
 * (04.01 Teacher Prep Day - classes resume 05.01)" — so only the FIRST two dates
 * count, and the rest becomes a label worth printing: "winter break" is exactly
 * the sort of thing to mention in a conference.
 */
export function parseDateCell(cell: string, startYear: number): ParsedDates | null {
  const dated = [...cell.matchAll(DATED)];
  const hadYear = dated.length > 0;
  const matches = hadYear ? dated : [...cell.matchAll(UNDATED)];

  const used: { date: string; index: number; length: number }[] = [];
  for (const match of matches) {
    const date = hadYear
      ? iso(Number(match[1]), Number(match[2]), Number(match[3]))
      : iso(Number(match[1]), Number(match[2]), academicYear(Number(match[2]), startYear));
    if (!date) continue;
    used.push({ date, index: match.index ?? 0, length: match[0].length });
    if (used.length === 2) break;
  }
  if (used.length === 0) return parseMonthNameCell(cell, startYear);

  // Only the dates actually consumed are cut out, so a label keeps the rest of
  // its own sentence: "WINTER BREAK (04.01 Teacher Prep Day - classes resume 05.01)".
  let leftover = "";
  let cursor = 0;
  for (const u of used) {
    leftover += cell.slice(cursor, u.index);
    cursor = u.index + u.length;
  }
  leftover = (leftover + cell.slice(cursor))
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—]+|[\s\-–—]+$/g, "")
    .trim();

  return { start: used[0].date, end: used[1]?.date ?? null, leftover, hadYear };
}


/**
 * The month-name spelling, tried only when no numeric date was found:
 * "(Oct 18 - 22)" is one month and two days, "(Dec 20 - Jan 3)" is two of each.
 * A bare number only counts once a month has been named in the same cell, so
 * stray digits elsewhere in the text cannot become a date.
 */
function parseMonthNameCell(cell: string, startYear: number): ParsedDates | null {
  const found: { date: string; index: number; length: number }[] = [];
  let month: number | null = null;

  for (const match of cell.matchAll(MONTH_DAY)) {
    const named = match[1];
    const day = Number(named ? match[2] : match[3]);
    if (named) month = MONTHS[named.slice(0, 3).toLowerCase()];
    if (month === null || !Number.isFinite(day)) continue;
    const date = iso(day, month, academicYear(month, startYear));
    if (!date) continue;
    found.push({ date, index: match.index ?? 0, length: match[0].length });
    if (found.length === 2) break;
  }
  if (found.length === 0) return null;

  let leftover = "";
  let cursor = 0;
  for (const f of found) {
    leftover += cell.slice(cursor, f.index);
    cursor = f.index + f.length;
  }
  leftover = (leftover + cell.slice(cursor))
    // What is left of "(Oct 18 - 22)" once the dates are out is "( - )".
    .replace(/\(\s*[-–—]?\s*\)/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—]+|[\s\-–—]+$/g, "")
    .trim();

  return { start: found[0].date, end: found[1]?.date ?? null, leftover, hadYear: false };
}

/** Criteria named in a topic: "(A & C)" -> ["A", "C"], "(level 7-8 section)" -> []. */
export function parseCriteria(topic: string): Criterion[] {
  const out = new Set<Criterion>();
  for (const match of topic.matchAll(/\(([^)]+)\)/g)) {
    const inside = match[1].trim();
    // Only a parenthetical that is nothing BUT criteria letters and separators,
    // so "(3 options)" and "(level 7-8 section)" are left alone.
    if (!/^[ABCD](\s*(?:&|,|and|\/)\s*[ABCD])*$/i.test(inside)) continue;
    for (const letter of inside.toUpperCase().match(/[ABCD]/g) ?? []) {
      out.add(letter as Criterion);
    }
  }
  return [...out].sort();
}

/** The academic year a file name or sheet name announces: "Daily Plan 202627" -> 2026. */
export function guessStartYear(fileName: string, sheetName: string): number | null {
  for (const source of [sheetName, fileName]) {
    const match = source.match(/(20\d{2})/);
    if (match) return Number(match[1]);
  }
  return null;
}

function pickColumn(headers: string[], pattern: RegExp): string | null {
  return headers.find((h) => h.trim() !== "" && pattern.test(h)) ?? null;
}

const CURRENT_ACADEMIC_YEAR = (): number => {
  const now = new Date();
  return now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
};

/**
 * Reads a year plan. `startYear` is only consulted for dates that carry no year
 * of their own; pass nothing and it is taken from the sheet or file name, else
 * the academic year we are currently in.
 *
 * A row is dropped, and said out loud in `skipped`, when its dates run backwards
 * or when it would go back in time from the row before it. On her real files that
 * fires exactly once — "29.01 - 01.11", a typo for 29.10 — and correcting it here
 * would be a guess. Left in, it would plant a January lesson in the middle of
 * November and offer it as "coming up" at an October conference.
 */
export async function parseYearPlan(
  buffer: Buffer | ArrayBuffer,
  options: { fileName?: string; startYear?: number } = {}
): Promise<ParsedPlan> {
  let table;
  try {
    table = await parseXlsxTable(buffer, { sheet: SHEET });
  } catch {
    throw new PlanSheetError("That file isn't a readable .xlsx workbook.");
  }
  if (table.headers.length === 0) throw new PlanSheetError("The workbook has no sheets.");

  const dateColumn = pickColumn(table.headers, COLUMNS.date);
  const topicColumn = pickColumn(table.headers, COLUMNS.topic);
  if (!dateColumn || !topicColumn) {
    throw new PlanSheetError(
      "This doesn't look like a daily plan — it needs a date column and a topic (or content) column."
    );
  }
  const unitColumn = pickColumn(table.headers, COLUMNS.unit);
  const lessonColumn = pickColumn(table.headers, COLUMNS.lesson);
  const resourcesColumn = pickColumn(table.headers, COLUMNS.resources);
  const noteColumn = pickColumn(table.headers, COLUMNS.note);

  const startYear =
    options.startYear ??
    guessStartYear(options.fileName ?? "", table.sheetName) ??
    CURRENT_ACADEMIC_YEAR();

  const entries: ParsedPlanEntry[] = [];
  const skipped: SkippedRow[] = [];
  const undated: { row: number; text: string }[] = [];
  let everyDateHadYear = true;
  let previousDate: string | null = null;

  table.rows.forEach((row, index) => {
    const rowNumber = table.rowNumbers[index] ?? index + 2;
    const cell = (row[dateColumn] ?? "").trim();
    const topicCell = (row[topicColumn] ?? "").trim();
    if (cell === "" && topicCell === "") return;

    const parsed = parseDateCell(cell, startYear);
    if (!parsed) {
      if (cell !== "") undated.push({ row: rowNumber, text: cell });
      return;
    }
    if (!parsed.hadYear) everyDateHadYear = false;

    if (parsed.end && parsed.end < parsed.start) {
      skipped.push({ row: rowNumber, cell, why: "the end date comes before the start" });
      return;
    }
    if (previousDate && parsed.start < previousDate) {
      skipped.push({ row: rowNumber, cell, why: `it goes back before ${previousDate}` });
      return;
    }

    // A break is merged across the whole row, so every column reports the same
    // string — which makes it free to recognise and worth keeping as content.
    const merged = topicCell === cell;
    const kind: PlanEntryKind = merged || /\bbreak\b/i.test(parsed.leftover) ? "break" : "lesson";
    const topic = kind === "break" ? parsed.leftover || "Break" : topicCell;
    if (topic === "") {
      previousDate = parsed.start;
      return; // a dated row with nothing on it
    }

    const note = [kind === "break" ? "" : parsed.leftover, merged ? "" : (row[noteColumn ?? ""] ?? "")]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" · ");

    entries.push({
      date: parsed.start,
      endDate: parsed.end,
      kind,
      lessonNo: merged ? null : (row[lessonColumn ?? ""] ?? "").trim() || null,
      unit: merged ? null : (row[unitColumn ?? ""] ?? "").trim() || null,
      topic,
      resources: merged ? null : (row[resourcesColumn ?? ""] ?? "").trim() || null,
      note: note || null,
      criteria: kind === "break" ? [] : parseCriteria(topic),
    });
    previousDate = parsed.start;
  });

  return {
    entries,
    sheetName: table.sheetName,
    startYear,
    yearFromFile: everyDateHadYear && entries.length > 0,
    skipped,
    undated,
  };
}
