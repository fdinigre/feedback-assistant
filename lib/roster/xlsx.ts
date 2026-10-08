// Parses an uploaded .xlsx workbook into the same { headers, rows } shape
// used by the CSV/TSV parsers, so the rest of the external-data import flow
// (name matching, blank-row stripping, preview/confirm) is format-agnostic.

import ExcelJS from "exceljs";
import type { CsvTable } from "./csv";

/** Renders a cell's value as the plain string the rest of the pipeline expects. */
function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    // Rich text, formula results, hyperlinks, etc.
    const obj = value as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (typeof obj.text === "string") return obj.text;
    if (Array.isArray(obj.richText)) return obj.richText.map((r) => r.text).join("");
    if (obj.result !== undefined && obj.result !== null) return String(obj.result);
    return "";
  }
  return String(value).trim();
}

/**
 * What an .xlsx read adds over the CSV shape: which sheet was read, and which
 * spreadsheet row each entry came from. Blank rows are dropped, so a row's index
 * in `rows` is not its row number — and a parser that wants to tell the teacher
 * "row 26 looks wrong" needs the real one.
 */
export type XlsxTable = CsvTable & { sheetName: string; rowNumbers: number[] };

/**
 * Reads one worksheet of an .xlsx buffer. The first non-empty row is treated as
 * the header row; every subsequent row becomes a data row keyed by header.
 * Wholly-empty rows are dropped (mirrors parseCsvTable).
 *
 * `sheet` picks a worksheet by name — a workbook with Summary and Timeline tabs
 * beside the one that matters should not be read by position.
 */
export async function parseXlsxTable(
  buffer: Buffer | ArrayBuffer,
  options?: { sheet?: RegExp }
): Promise<XlsxTable> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as ExcelJS.Buffer);
  const sheet =
    (options?.sheet ? workbook.worksheets.find((w) => options.sheet!.test(w.name)) : undefined) ??
    workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [], sheetName: "", rowNumbers: [] };

  let headers: string[] | null = null;
  const rows: Record<string, string>[] = [];
  const rowNumbers: number[] = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: string[] = [];
    // ExcelJS rows are 1-indexed and sparse; walk up to row.cellCount to
    // preserve blank cells in the middle of the row (so column alignment
    // with the header row stays correct).
    for (let col = 1; col <= row.cellCount; col++) {
      cells.push(cellToString(row.getCell(col).value));
    }

    if (headers === null) {
      // Skip leading wholly-empty rows before the header.
      if (cells.every((c) => c.trim() === "")) return;
      headers = cells.map((c) => c.trim());
      return;
    }

    if (cells.every((c) => c.trim() === "")) return; // wholly-blank data row

    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? "").trim();
    });
    rows.push(obj);
    rowNumbers.push(rowNumber);
  });

  return { headers: headers ?? [], rows, sheetName: sheet.name, rowNumbers };
}
