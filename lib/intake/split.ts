// Splitting one PDF of a whole class into one test per student: which pages each
// test gets, and what each is called. No server imports, so the checks can run it.

export type PageRange = { from: number; to: number };

/** The pages of each test, 1-based and in scan order; the last takes what is left. */
export function splitRanges(pageCount: number, pagesPerTest: number): PageRange[] {
  const ranges: PageRange[] = [];
  for (let from = 1; from <= pageCount; from += pagesPerTest) {
    ranges.push({ from, to: Math.min(from + pagesPerTest - 1, pageCount) });
  }
  return ranges;
}

/**
 * "Class scan test 03 (pages 9-12).pdf": numbered to sort in scan order, with the
 * pages it came from, so a test can be found again in the original file.
 */
export function splitPartName(originalName: string, index: number, total: number, range: PageRange): string {
  const base = originalName.replace(/\.pdf$/i, "").trim() || "Scan";
  const number = String(index + 1).padStart(String(total).length, "0");
  const pages = range.from === range.to ? `page ${range.from}` : `pages ${range.from}-${range.to}`;
  return `${base} test ${number} (${pages}).pdf`;
}

/**
 * The "pages per test" box: empty means each PDF is already one test (null); a
 * whole number of 1 or more splits by it; anything else is a mistake to report.
 */
export function parsePagesPerTest(raw: unknown): number | null | "invalid" {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text === "") return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 1 ? n : "invalid";
}

/** What to tell the teacher when a file does not divide evenly, or null when it does. */
export function unevenSplitNote(
  fileName: string,
  pageCount: number,
  pagesPerTest: number,
  lastPartName: string
): string | null {
  const left = pageCount % pagesPerTest;
  if (left === 0) return null;
  return `${fileName} has ${pageCount} pages, which is not a multiple of ${pagesPerTest}: the last test, "${lastPartName}", has only ${left} page${left === 1 ? "" : "s"}. Check the scan for a missing or extra page.`;
}
