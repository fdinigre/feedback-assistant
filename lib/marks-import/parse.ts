import ExcelJS from "exceljs";

/**
 * Reads a marks spreadsheet of the shape teachers actually keep: a Name column,
 * one column per question (Q1, Q2, …), group subtotal columns that are derived
 * and must be ignored, and a trailing row of maximums written as "/3".
 *
 * Nothing here assumes fixed row or column numbers. The sheet is found by
 * looking for the row that carries the question labels, because banded group
 * headers, merged title cells and blank spacer rows above it are all normal.
 */

export type ParsedMarksRow = {
  /** Row number in the sheet, for pointing at problems. */
  rowNumber: number;
  name: string;
  /** Question label (as written, e.g. "Q4a") -> mark, or null when the cell was blank. */
  marks: Map<string, number | null>;
};

export type ParsedMarksSheet = {
  /** Question labels in sheet order. */
  questionLabels: string[];
  /** Max marks per label, from the "/3" row if the sheet has one. */
  maxByLabel: Map<string, number>;
  rows: ParsedMarksRow[];
  /** Columns deliberately skipped (subtotals and similar), for the summary. */
  ignoredColumns: string[];
};

export class MarksSheetError extends Error {}

// "Q4", "Q 4a", "Q1a)" and "Q1(a)" are all the same heading to a teacher; the
// bracket or dot after a part letter is decoration, not part of the label.
// Lettered sections ("B1", "QB1", "C1") count too — a Financial Math test
// numbers its parts that way.
const QUESTION_LABEL = /^(?:q\s*[a-z]?|[a-z])\s*\d+\s*\(?\s*[a-z]?\s*[).]?$/i;
const MAX_CELL = /^\/\s*(\d+(?:\.\d+)?)$/;

/** "Q 4a" / "q4A" -> "Q4a" and "b1" / "QB1" -> "QB1", so the same question always keys the same way. */
export function normaliseLabel(raw: string): string {
  const m = raw.trim().match(/^(?:q\s*([a-z]?)|([a-z]))\s*(\d+)\s*\(?\s*([a-z]?)\s*[).]?$/i);
  if (!m) return raw.trim();
  const section = (m[1] || m[2] || "").toUpperCase();
  return `Q${section}${m[3]}${m[4].toLowerCase()}`;
}

/**
 * The question number as the app stores it ("1", "4a") from a sheet label
 * ("Q1", "Q4a"). Comparison elsewhere is on this form.
 */
export function labelToQuestionNumber(label: string): string {
  return normaliseLabel(label).replace(/^Q/i, "").toLowerCase();
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const obj = value as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (typeof obj.text === "string") return obj.text.trim();
    if (Array.isArray(obj.richText)) return obj.richText.map((r) => r.text).join("").trim();
    if (obj.result !== undefined && obj.result !== null) return String(obj.result).trim();
    return "";
  }
  return String(value).trim();
}

/** A mark cell: a number, or null when blank. Anything else is rejected loudly. */
function parseMark(text: string, rowNumber: number, label: string): number | null {
  if (text === "") return null;
  const n = Number(text);
  if (!Number.isFinite(n)) {
    throw new MarksSheetError(
      `Row ${rowNumber}, ${label}: "${text}" is not a number. Fix the cell and upload again.`
    );
  }
  if (n < 0) {
    throw new MarksSheetError(`Row ${rowNumber}, ${label}: marks cannot be negative.`);
  }
  return n;
}

export async function parseMarksSheet(buffer: Buffer | ArrayBuffer): Promise<ParsedMarksSheet> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as ExcelJS.Buffer);
  } catch {
    throw new MarksSheetError("That file isn't a readable .xlsx workbook.");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new MarksSheetError("The workbook has no sheets.");

  // Read the whole grid as text first; the layout questions are easier to answer
  // with all of it visible than one row at a time.
  const grid: string[][] = [];
  const width = Math.max(sheet.columnCount, 1);
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: string[] = [];
    for (let col = 1; col <= width; col++) cells.push(cellText(row.getCell(col).value));
    grid[rowNumber] = cells;
  });

  // The header row is the one with the most question labels on it.
  let headerRow = -1;
  let bestCount = 0;
  for (let r = 1; r < grid.length; r++) {
    const count = (grid[r] ?? []).filter((c) => QUESTION_LABEL.test(c)).length;
    if (count > bestCount) {
      bestCount = count;
      headerRow = r;
    }
  }
  if (headerRow === -1 || bestCount === 0) {
    throw new MarksSheetError(
      "Couldn't find the question columns. The sheet needs a row of headings like Q1, Q2, Q3."
    );
  }

  const header = grid[headerRow] ?? [];

  // The name column: headed "Name" on the header row or the one above it. A
  // title cell merged down the two header rows reports its value on both, so
  // either row can carry it.
  let nameCol = -1;
  for (const r of [headerRow, headerRow - 1]) {
    const row = grid[r] ?? [];
    const idx = row.findIndex((c) => c.trim().toLowerCase() === "name");
    if (idx !== -1) {
      nameCol = idx;
      break;
    }
  }
  if (nameCol === -1) nameCol = 0;

  // Question columns, and which columns are deliberately skipped (group
  // subtotals and the like). The name column isn't "ignored" — it's the one
  // column being read most closely — so it doesn't belong in that list.
  const labelByCol = new Map<number, string>();
  const ignoredColumns: string[] = [];
  header.forEach((text, idx) => {
    if (QUESTION_LABEL.test(text)) {
      labelByCol.set(idx, normaliseLabel(text));
    } else if (text !== "" && idx !== nameCol) {
      ignoredColumns.push(text);
    }
  });

  // Data rows, plus the trailing maximums row if present.
  const maxByLabel = new Map<string, number>();
  const rows: ParsedMarksRow[] = [];

  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;

    // A maximums row: no name, and its question cells read "/3".
    const looksLikeMaxRow =
      (row[nameCol] ?? "") === "" &&
      [...labelByCol.keys()].some((col) => MAX_CELL.test(row[col] ?? ""));
    if (looksLikeMaxRow) {
      for (const [col, label] of labelByCol) {
        const m = (row[col] ?? "").match(MAX_CELL);
        if (m) maxByLabel.set(label, Number(m[1]));
      }
      continue;
    }

    const name = (row[nameCol] ?? "").trim();
    if (name === "") continue; // spacer or summary row

    const marks = new Map<string, number | null>();
    for (const [col, label] of labelByCol) {
      marks.set(label, parseMark(row[col] ?? "", r, label));
    }
    rows.push({ rowNumber: r, name, marks });
  }

  if (rows.length === 0) {
    throw new MarksSheetError("No student rows found beneath the question headings.");
  }

  return {
    questionLabels: [...labelByCol.values()],
    maxByLabel,
    rows,
    ignoredColumns: [...new Set(ignoredColumns)],
  };
}
