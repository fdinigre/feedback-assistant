// Matches rows from an imported external-data export (MAP, CAT4, prior-year
// grades, ATL — column layouts vary between exports) to roster students by
// name (exact, case-insensitive).

import type { StudentRow } from "@/lib/types";

const NAME_HEADER_HINTS = ["name", "student", "aluno"];

/**
 * Picks the column most likely to hold the student's full name.
 * 1. An exact header match ("name", "student name", "student").
 * 2. A header containing name/student/aluno.
 * 3. If `rows` is supplied and no header hint matched: the first column
 *    that is "text-mostly" (more non-empty values look like names/words than
 *    like numbers) — a best-effort fallback for exports with unlabeled or
 *    unusual name columns.
 * 4. Otherwise, the first column.
 */
export function findNameColumn(
  headers: string[],
  rows?: Record<string, string>[]
): string | null {
  if (headers.length === 0) return null;
  const lower = headers.map((h) => h.toLowerCase().trim());

  const exact = lower.findIndex(
    (h) => h === "name" || h === "student name" || h === "student"
  );
  if (exact >= 0) return headers[exact];

  const partial = lower.findIndex((h) => NAME_HEADER_HINTS.some((hint) => h.includes(hint)));
  if (partial >= 0) return headers[partial];

  if (rows && rows.length > 0) {
    const textMostly = findTextMostlyColumn(headers, rows);
    if (textMostly) return textMostly;
  }

  return headers[0];
}

const NUMERIC_PATTERN = /^-?\d+(\.\d+)?%?$/;

/** True if a cell value looks like a plain number (not a name/word). */
function looksNumeric(value: string): boolean {
  const v = value.trim();
  return v !== "" && NUMERIC_PATTERN.test(v);
}

/** Picks the column with the highest share of non-empty, non-numeric values. */
function findTextMostlyColumn(
  headers: string[],
  rows: Record<string, string>[]
): string | null {
  let best: { header: string; score: number } | null = null;
  for (const header of headers) {
    let nonEmpty = 0;
    let textLike = 0;
    for (const row of rows) {
      const value = (row[header] ?? "").trim();
      if (!value) continue;
      nonEmpty++;
      if (!looksNumeric(value)) textLike++;
    }
    if (nonEmpty === 0) continue;
    const score = textLike / nonEmpty;
    if (!best || score > best.score) {
      best = { header, score };
    }
  }
  // Require a real majority of text-like values — otherwise this fallback
  // isn't confident enough to beat "just use the first column".
  return best && best.score >= 0.5 ? best.header : null;
}

export type MatchedRow = { rowIndex: number; studentId: number };
export type UnmatchedRow = { rowIndex: number };

/**
 * Exact, case-insensitive match of CSV rows to roster students by name.
 * `rowIndex` is the position of the row within the parsed CSV's data rows.
 */
export function matchRowsToRoster(
  rows: Record<string, string>[],
  nameColumn: string,
  students: StudentRow[]
): { matched: MatchedRow[]; unmatched: UnmatchedRow[] } {
  const byName = new Map<string, StudentRow>();
  for (const s of students) {
    byName.set(s.name.trim().toLowerCase(), s);
  }

  const matched: MatchedRow[] = [];
  const unmatched: UnmatchedRow[] = [];

  rows.forEach((row, rowIndex) => {
    const value = (row[nameColumn] ?? "").trim().toLowerCase();
    const student = value ? byName.get(value) : undefined;
    if (student) {
      matched.push({ rowIndex, studentId: student.id });
    } else {
      unmatched.push({ rowIndex });
    }
  });

  return { matched, unmatched };
}
