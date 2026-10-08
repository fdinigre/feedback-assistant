// Minimal, dependency-free delimited-text parser for the roster/external-data
// import flows. Handles quoted fields (including embedded delimiters,
// newlines, and escaped "" quotes), unquoted fields, and CRLF or LF line
// endings. Supports comma (CSV) and tab (TSV) delimiters — the same paste/
// upload flow accepts both since pasting from a spreadsheet's clipboard
// commonly yields tab-separated values.

/** Parses raw delimited text into an array of rows, each an array of string cells. */
export function parseDelimitedRows(input: string, delimiter: string = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = input.length;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < len) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === delimiter) {
      pushField();
      i++;
      continue;
    }
    if (char === "\r") {
      if (input[i + 1] === "\n") {
        pushRow();
        i += 2;
        continue;
      }
      pushRow();
      i++;
      continue;
    }
    if (char === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += char;
    i++;
  }

  // Flush a trailing field/row that wasn't terminated by a newline.
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  // Drop wholly-empty trailing rows produced by a trailing newline.
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/** Parses raw CSV text into an array of rows, each an array of string cells. */
export function parseCsvRows(input: string): string[][] {
  return parseDelimitedRows(input, ",");
}

/** Parses raw TSV text into an array of rows, each an array of string cells. */
export function parseTsvRows(input: string): string[][] {
  return parseDelimitedRows(input, "\t");
}

export type CsvTable = { headers: string[]; rows: Record<string, string>[] };

function rowsToTable(rows: string[][]): CsvTable {
  if (rows.length === 0) return { headers: [], rows: [] };

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((h) => h.trim());
  const objects = dataRows
    .filter((r) => r.some((cell) => cell.trim() !== ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = (r[idx] ?? "").trim();
      });
      return obj;
    });

  return { headers, rows: objects };
}

/**
 * Parses a CSV string into headers (first row) plus row objects keyed by
 * header. Blank data rows (every cell empty) are dropped.
 */
export function parseCsvTable(input: string): CsvTable {
  return rowsToTable(parseCsvRows(input));
}

/**
 * Parses a TSV string into headers (first row) plus row objects keyed by
 * header. Blank data rows (every cell empty) are dropped.
 */
export function parseTsvTable(input: string): CsvTable {
  return rowsToTable(parseTsvRows(input));
}

/**
 * Parses pasted/uploaded delimited text, auto-detecting comma vs. tab from
 * the first line (pasting a spreadsheet selection into a textarea commonly
 * produces tab-separated values, not CSV).
 */
export function parseDelimitedTableAuto(input: string): CsvTable {
  const firstLine = input.split(/\r\n|\r|\n/, 1)[0] ?? "";
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const delimiter = tabCount > commaCount ? "\t" : ",";
  return rowsToTable(parseDelimitedRows(input, delimiter));
}

/**
 * Drops rows where every column OTHER than the name column is empty — the
 * teacher's exports often include rows for students without any data on
 * file for that source, which should be skipped silently rather than
 * surfaced as unmatched/blank imports.
 */
export function stripBlankDataRows(
  table: CsvTable,
  nameColumn: string | null
): { table: CsvTable; blankSkipped: number } {
  const dataHeaders = nameColumn
    ? table.headers.filter((h) => h !== nameColumn)
    : table.headers;

  let blankSkipped = 0;
  const rows = table.rows.filter((row) => {
    const hasData = dataHeaders.some((h) => (row[h] ?? "").trim() !== "");
    if (!hasData) {
      blankSkipped++;
      return false;
    }
    return true;
  });

  return { table: { headers: table.headers, rows }, blankSkipped };
}
