// Parses the free-form input accepted by the "bulk add students" flow: either
// a pasted/uploaded class-list CSV, or plain newline-separated names.

import { parseCsvRows } from "./csv";

function looksLikeCsv(input: string): boolean {
  const firstLine = input.split(/\r\n|\r|\n/)[0] ?? "";
  return firstLine.includes(",") || firstLine.includes('"');
}

/**
 * Parses pasted/uploaded text into a flat list of unique, trimmed student
 * names, preserving input order.
 *
 * - If the text looks like CSV (a comma or quote on the first line), a
 *   header row containing a "name" column is used if present; otherwise the
 *   first column of every row (including what would have been the header)
 *   is treated as the name.
 * - Otherwise, each non-empty line is treated as one name.
 */
export function parseNameList(input: string): string[] {
  const trimmedInput = input.trim();
  if (!trimmedInput) return [];

  let names: string[];
  if (looksLikeCsv(trimmedInput)) {
    const rows = parseCsvRows(trimmedInput);
    if (rows.length === 0) return [];
    const [headerRow, ...dataRows] = rows;
    const nameColIdx = headerRow.findIndex((h) => h.trim().toLowerCase() === "name");
    if (nameColIdx >= 0) {
      names = dataRows.map((r) => r[nameColIdx] ?? "");
    } else {
      // No recognizable header — treat every row (including the first) as data.
      names = rows.map((r) => r[0] ?? "");
    }
  } else {
    names = trimmedInput.split(/\r\n|\r|\n/);
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}
