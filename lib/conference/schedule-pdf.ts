/**
 * Reads the booking system's printed conference schedule.
 *
 * Its PDF is regular but awkward in four ways, all of them handled here rather
 * than by asking a model to read it:
 *
 *   Oct 06,            the date wraps across two lines
 *   2026
 *   08:00 am -         so does the time range
 *   08:09 am
 *   Nora Whitfield Paul Whitfield, Anna Whitfield 9.3
 *
 * — the student and the parents share one line with nothing between them, so
 *   only the roster can say where the name ends;
 * — a long name wraps too, and so do the parents, so a slot is a blob of text
 *   rather than a row;
 * — the font's ligatures come out as single characters, which is why the roster
 *   has "Delfina Brandt" and the PDF has "Delﬁna Brandt";
 * — empty slots and "Teacher Break" carry no student at all.
 *
 * Roster names come in as an argument, so this stays pure and testable.
 */

export type SchedulePdfSlot = {
  /** ISO date of the evening this slot belongs to. */
  date: string;
  /** "08:00", 24-hour. */
  time: string;
  /**
   * What the schedule calls them, which is the fuller name where the roster
   * holds only a first name. For display.
   */
  studentName: string | null;
  /**
   * The exact roster string that matched. For identifying the student — the
   * two differ, and looking up by the display name would find nobody.
   */
  rosterName: string | null;
  parentName: string | null;
  /** The slot's text as read, kept so an unmatched line can still be shown. */
  raw: string;
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** The ligatures this PDF's font emits, which no roster contains. */
export function normaliseLigatures(text: string): string {
  return text
    .replace(/ﬀ/g, "ff")
    .replace(/ﬁ/g, "fi")
    .replace(/ﬂ/g, "fl")
    .replace(/ﬃ/g, "ffi")
    .replace(/ﬄ/g, "ffl")
    .replace(/ /g, " ");
}

function isoDate(month: string, day: string, year: string): string | null {
  const m = MONTHS[month.slice(0, 3).toLowerCase()];
  if (!m) return null;
  return `${year}-${String(m).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
}

function to24h(hhmm: string, suffix: string): string {
  let h = Number(hhmm.split(":")[0]);
  const m = Number(hhmm.split(":")[1]);
  const ampm = suffix.toLowerCase();
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** A slot header: the date and the start of its time range, both possibly wrapped. */
const SLOT = /([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{4})\s*(\d{1,2}:\d{2})\s*(am|pm)\s*-\s*\d{1,2}:\d{2}\s*(?:am|pm)/g;

/** The advisory code the booking system puts at the end of every real row. */
const ADVISORY = /\s*\b\d{1,2}\.\d{1,2}\s*$/;

const NOT_A_MEETING = /^(teacher break|break|lunch|unavailable)$/i;

/**
 * Splits a slot's text into the student and the parents, using the roster.
 *
 * Longest roster name that starts the line wins. A one-word match is normal
 * here, not a warning sign: all eighteen Financial Math students are on the
 * roster by first name alone, so "Clara" is how "Clara Torres" appears and
 * refusing it would lose a third of that class.
 *
 * What is a warning sign is a tie — two different students matching equally
 * well. Five first names repeat on this roster, so that is a real case, and it
 * is reported as uncertain rather than resolved, because resolving it wrongly
 * puts the wrong child's grades in front of a parent.
 *
 * The fallback covers the other direction: the PDF writes "Daniel Costa" where
 * the roster says "Daniel Pereira Costa". A name whose words appear in a roster
 * name in order counts, which is exact rather than a distance metric.
 */
function splitOnRoster(
  text: string,
  rosterNames: string[]
): { student: string | null; roster: string | null; parents: string | null; confident: boolean } {
  const flat = text.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();

  let bestLength = 0;
  let bestNames: string[] = [];
  for (const name of rosterNames) {
    const candidate = name.replace(/\s+/g, " ").trim();
    if (!candidate || !lower.startsWith(candidate.toLowerCase())) continue;
    // Must end on a word boundary, so "Sam" does not match inside "Samira".
    const next = flat[candidate.length];
    if (next && /[\p{L}\p{N}]/u.test(next)) continue;
    if (candidate.length > bestLength) {
      bestLength = candidate.length;
      bestNames = [candidate];
    } else if (candidate.length === bestLength && !bestNames.includes(candidate)) {
      bestNames.push(candidate);
    }
  }

  if (bestNames.length === 1) {
    let consumed = bestLength;
    // The roster match says WHO; the schedule says what they are called. Where
    // the roster holds only a first name — which is how all eighteen Financial
    // Math students are recorded — the surname the schedule prints would
    // otherwise be read as the start of the parents: "Lena" with parents
    // "Fischer Julia Fischer". This booking system always prints the student's
    // full name first, so one following capitalised word belongs to them.
    if (!flat.slice(0, bestLength).includes(" ")) {
      const nextWord = /^\s+(\p{Lu}[\p{L}'-]+)/u.exec(flat.slice(bestLength));
      if (nextWord) consumed = bestLength + nextWord[0].length;
    }
    const parents = flat.slice(consumed).trim().replace(/^[,;-]\s*/, "");
    return {
      student: flat.slice(0, consumed).trim(),
      roster: bestNames[0],
      parents: parents || null,
      confident: true,
    };
  }
  if (bestNames.length > 1) {
    return { student: null, roster: null, parents: null, confident: false }; // a tie is a question
  }

  const words = flat.split(" ");
  for (let n = Math.min(4, words.length); n >= 2; n--) {
    const candidateWords = words.slice(0, n).map((w) => w.toLowerCase());
    const hits = rosterNames.filter((name) => {
      const rosterWords = name.toLowerCase().split(/\s+/);
      let at = 0;
      return candidateWords.every((w) => {
        const found = rosterWords.indexOf(w, at);
        if (found < 0) return false;
        at = found + 1;
        return true;
      });
    });
    if (hits.length === 1) {
      const parents = words.slice(n).join(" ").trim().replace(/^[,;-]\s*/, "");
      return {
        student: words.slice(0, n).join(" "),
        roster: hits[0],
        parents: parents || null,
        confident: true,
      };
    }
  }

  return { student: null, roster: null, parents: null, confident: false };
}

export function parseSchedulePdf(pageTexts: string[], rosterNames: string[]): SchedulePdfSlot[] {
  const text = normaliseLigatures(pageTexts.join("\n"));

  // Every slot header, with the span of text that follows it, which is that
  // slot's content however many lines it wrapped over.
  const headers: { date: string; time: string; from: number; to: number }[] = [];
  let match: RegExpExecArray | null;
  SLOT.lastIndex = 0;
  while ((match = SLOT.exec(text)) !== null) {
    const date = isoDate(match[1], match[2], match[3]);
    if (!date) continue;
    headers.push({
      date,
      time: to24h(match[4], match[5]),
      from: match.index + match[0].length,
      to: text.length,
    });
  }
  headers.forEach((h, i) => {
    if (i + 1 < headers.length) h.to = headers[i + 1].from - 0;
  });

  const slots: SchedulePdfSlot[] = [];
  for (const [i, header] of headers.entries()) {
    const bodyEnd = i + 1 < headers.length ? headers[i + 1].from : text.length;
    let body = text.slice(header.from, bodyEnd);
    // Strip the next slot's header text if it bled in, and the page furniture.
    body = body
      .replace(SLOT, "")
      .replace(/THE KAUST SCHOOL|Student-Parent-Teacher Conference[^\n]*|Conference Schedule for[^\n]*|Date\s+Time\s+Student\s+Parent\(s\)\s+Advisory/gi, "")
      .replace(/\b[A-Z][a-z]{2}\s+\d{1,2},\s*\d{4}\b/g, "")
      .replace(/\b\d{1,2}:\d{2}\s*(am|pm)\s*-?/gi, "")
      .trim();

    const advisoryStripped = body.replace(/\s+/g, " ").replace(ADVISORY, "").trim();
    if (!advisoryStripped || NOT_A_MEETING.test(advisoryStripped)) continue;

    const { student, roster, parents, confident } = splitOnRoster(advisoryStripped, rosterNames);
    slots.push({
      date: header.date,
      time: header.time,
      studentName: confident ? student : null,
      rosterName: confident ? roster : null,
      parentName: confident ? parents : null,
      raw: advisoryStripped,
    });
  }
  return slots;
}
