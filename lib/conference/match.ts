import "server-only";

import { listClasses, listStudents } from "@/lib/db/queries";
import type { StudentRow } from "@/lib/types";

/**
 * Matches a pasted list of names — the booking list, typed by someone else — to
 * the roster across every class.
 *
 * The rule throughout is that an uncertain match is a question, never a guess.
 * The roster has 75 distinct full names but five repeated first names, so "Sara"
 * is genuinely ambiguous and picking the first one found would quietly put the
 * wrong child's grades in front of a parent. lib/roster/match.ts cannot be reused
 * for this: it builds its lookup by overwriting, so a duplicate silently resolves
 * to whoever was inserted last.
 */

export type RosterEntry = { student: StudentRow; className: string };

export type NameMatch =
  | { kind: "matched"; input: string; entry: RosterEntry; via: "full" | "partial" }
  | { kind: "ambiguous"; input: string; candidates: RosterEntry[] }
  | { kind: "unmatched"; input: string; suggestions: RosterEntry[] };

/**
 * Harder than trim+lowercase, because a list copied out of a booking system will
 * eventually carry all of these: accents, curly apostrophes, double spaces, and
 * "Last, First" ordering.
 */
export function normaliseName(name: string): string {
  let out = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const comma = out.indexOf(",");
  if (comma > 0) {
    const last = out.slice(0, comma).trim();
    const first = out.slice(comma + 1).trim();
    if (first) out = `${first} ${last}`;
  }
  return out;
}

function tokens(name: string): string[] {
  return normaliseName(name).split(" ").filter(Boolean);
}

export function loadRoster(): RosterEntry[] {
  const classNameById = new Map(listClasses().map((c) => [c.id, c.name]));
  return listStudents().map((student) => ({
    student,
    className: classNameById.get(student.class_id) ?? "",
  }));
}

function resolve(input: string, roster: RosterEntry[]): NameMatch {
  const wanted = normaliseName(input);
  const wantedTokens = tokens(input);

  const exact = roster.filter((e) => normaliseName(e.student.name) === wanted);
  if (exact.length === 1) return { kind: "matched", input, entry: exact[0], via: "full" };
  if (exact.length > 1) return { kind: "ambiguous", input, candidates: exact };

  // Every word she typed appears in the name — covers "Nora" for "Nora Whitfield"
  // and "Whitfield Nora" for the same person.
  const contains = roster.filter((e) => {
    const names = tokens(e.student.name);
    return wantedTokens.every((t) => names.includes(t));
  });
  if (contains.length === 1) return { kind: "matched", input, entry: contains[0], via: "partial" };
  if (contains.length > 1) return { kind: "ambiguous", input, candidates: contains };

  // Nothing matched: offer anyone sharing a word, and let her decide. Deliberately
  // no edit-distance guessing — with five repeated first names on the roster it
  // would confidently pick the wrong Sara.
  const suggestions = roster.filter((e) => {
    const names = tokens(e.student.name);
    return wantedTokens.some((t) => names.includes(t));
  });
  return { kind: "unmatched", input, suggestions };
}

export function matchNames(names: string[], roster: RosterEntry[] = loadRoster()): NameMatch[] {
  return names.map((name) => resolve(name, roster));
}
