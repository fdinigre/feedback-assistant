/**
 * School semesters, labelled the way prior grades are imported ("2026-27 S1").
 *
 * At this school semester 1 runs from August to the winter break and semester 2
 * from January to the end of the year — the year plans put the "semester
 * reflection" lesson in mid-December and classes resuming on 5 January — so a
 * date's month is enough to place it.
 *
 * No imports: the conference page's components use these as well.
 */

/** "2026-10-07" -> "2026-27 S1"; "2027-02-10" -> "2026-27 S2". */
export function semesterOf(isoDate: string): string {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const startYear = month >= 8 ? year : year - 1;
  const label = `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
  return `${label} ${month >= 8 ? "S1" : "S2"}`;
}

/** "2026-27 S2" -> "2026-27 S1"; "2026-27 S1" -> "2025-26 S2". */
export function previousSemester(period: string): string {
  const match = /^(\d{4})-\d{2} S([12])$/.exec(period);
  if (!match) return period;
  const startYear = Number(match[1]);
  if (match[2] === "2") return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")} S1`;
  return `${startYear - 1}-${String(startYear % 100).padStart(2, "0")} S2`;
}

/**
 * Whether an imported period comes before the given semester. Labels in the
 * standard form compare as text; anything else ("Grade 10 (MYP)", from the
 * import that predates semesters) is an earlier year by construction.
 */
export function isBeforeSemester(period: string, semester: string): boolean {
  if (!/^\d{4}-\d{2} S[12]$/.test(period)) return true;
  return period < semester;
}
