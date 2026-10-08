/**
 * Reads an evening's schedule out of whatever was pasted in.
 *
 * The booking system produces a table: a time, the student, and usually the
 * parent coming. People paste it as text, or as a list of bare names, or with
 * the columns in a different order — so this takes each line on its own and
 * works out which part is which, rather than demanding a format.
 *
 * Separated from the matcher on purpose: this decides what the line SAYS, and
 * lib/conference/match.ts decides who it MEANS. A schedule PDF's extracted text
 * feeds into the same place.
 *
 * No leaf imports: the paste box previews this as you type.
 */

export type ScheduleLine = {
  /** "16:20", 24-hour, where the line carried a time. */
  time: string | null;
  studentName: string;
  parentName: string | null;
  /** The line as written, so nothing is lost when a name does not match. */
  raw: string;
};

/** 16:20, 4:20pm, 16.20, 4 PM. */
const TIME = /\b(\d{1,2})[:.]?(\d{2})?\s*(am|pm|AM|PM)?\b/;

function normaliseTime(hRaw: string, mRaw: string | undefined, suffix: string | undefined): string | null {
  let h = Number(hRaw);
  const m = mRaw ? Number(mRaw) : 0;
  if (!Number.isFinite(h) || h > 23 || m > 59) return null;
  const ampm = suffix?.toLowerCase();
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  // A bare number with no minutes and no am/pm is a row number, not a time.
  if (!mRaw && !ampm) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Looks like a person's name rather than a room, a class code or a note. */
function looksLikeName(part: string): boolean {
  if (part.length < 2 || part.length > 60) return false;
  if (!/\p{L}/u.test(part)) return false;
  // "G9 Extended", "Room 12", "Mathematics (MYP)" are columns, not people.
  if (/^(room|rm|class|grade|g\d|year|subject|teacher|slot|#)\b/i.test(part)) return false;
  return true;
}

export function parseScheduleLine(line: string): ScheduleLine | null {
  const raw = line.trim();
  if (!raw) return null;
  // A header row names its own columns.
  if (/^(time|student|parent|name|guardian)\b/i.test(raw) && /\s{2,}|\t|,|\|/.test(raw)) return null;

  let rest = raw;
  let time: string | null = null;
  const match = TIME.exec(rest);
  if (match) {
    const parsed = normaliseTime(match[1], match[2], match[3]);
    if (parsed) {
      time = parsed;
      rest = (rest.slice(0, match.index) + " " + rest.slice(match.index + match[0].length)).trim();
    }
  }

  // Columns come through as tabs, pipes, commas or runs of spaces. A single
  // space is inside a name, so it is never a separator.
  const parts = rest
    .split(/\t+|\s*\|\s*|\s*[;,]\s*|\s{2,}|\s+[-–—]\s+/)
    .map((p) => p.trim().replace(/^[-–—•·]\s*/, ""))
    .filter((p) => p.length > 0 && looksLikeName(p));

  if (parts.length === 0) return null;
  return {
    time,
    studentName: parts[0],
    // Anything after the student is who is coming. Joined rather than taking
    // the second, because "Mr and Mrs Haddad" can arrive split across columns.
    parentName: parts.length > 1 ? parts.slice(1).join(", ") : null,
    raw,
  };
}

export function parseSchedule(text: string): ScheduleLine[] {
  const lines = text.split(/\r?\n/).map(parseScheduleLine).filter((l): l is ScheduleLine => l !== null);
  // A schedule pasted out of order is still an order: sort by time where every
  // line has one, otherwise keep the order it was given in.
  if (lines.length > 1 && lines.every((l) => l.time)) {
    return [...lines].sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  }
  return lines;
}
