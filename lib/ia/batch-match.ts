// Matches uploaded IA file names to the students of a class, for the batch
// upload on the IA page. Pure (no DB, no server-only): runs in the browser and
// in the checks. Only ever sees file names and the roster names already shown
// on that page; nothing here is sent anywhere.

export type MatchStudent = { id: number; name: string };

export type FileMatch =
  | { kind: "matched"; studentId: number }
  | { kind: "ambiguous"; candidateIds: number[] }
  | { kind: "none" };

/** Lower case, accents removed, anything that is not a letter or digit becomes a space. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Words that appear in file names but are never part of a student's name.
const FILLER = new Set([
  "ia", "draft", "final", "exploration", "math", "maths", "mathematics", "ai", "aa", "sl", "hl",
  "internal", "assessment", "copy", "version", "first", "second", "pdf", "docx", "doc", "v",
  "rough", "submission", "the", "of", "and",
]);

function tokensOf(s: string, dropFiller: boolean): string[] {
  return normalizeName(s)
    .split(" ")
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t) && !(dropFiller && FILLER.has(t)));
}

export function fileStem(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

/**
 * The words of a student's name, each with the spellings that count as a hit: a
 * hyphenated or spaced surname ("Al-Harbi") hits as "alharbi" or by its longer
 * parts ("harbi"), so "AlHarbi_Maryam.pdf" still finds her.
 */
function nameWordKeys(name: string): string[][] {
  return name
    .split(/\s+/)
    .map((word) => {
      const parts = normalizeName(word).split(" ").filter(Boolean);
      const joined = parts.join("");
      const keys = new Set<string>();
      if (joined.length >= 2) keys.add(joined);
      for (const p of parts) if (p.length >= 3) keys.add(p);
      return [...keys];
    })
    .filter((keys) => keys.length > 0);
}

/**
 * Scores each student by how many words of their name appear as whole words in the
 * file name. The student with the strictly highest score is the match. A tie is
 * ambiguous (two students share a first name and the file name holds only that): it is
 * never settled by guessing, because a wrong match puts one student's paper in
 * another's file. A score of zero is no match.
 */
export function matchFileToStudent(fileName: string, students: MatchStudent[]): FileMatch {
  const fileTokens = new Set(tokensOf(fileStem(fileName), true));
  const scored = students
    .map((s) => ({
      id: s.id,
      hits: nameWordKeys(s.name).filter((keys) => keys.some((k) => fileTokens.has(k))).length,
    }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  if (scored.length === 0) return { kind: "none" };
  const tied = scored.filter((x) => x.hits === scored[0].hits);
  if (tied.length === 1) return { kind: "matched", studentId: tied[0].id };
  return { kind: "ambiguous", candidateIds: tied.map((x) => x.id) };
}

/** Student ids that more than one file is currently assigned to. */
export function duplicateAssignments(assigned: (number | null)[]): Set<number> {
  const seen = new Set<number>();
  const dup = new Set<number>();
  for (const id of assigned) {
    if (id == null) continue;
    if (seen.has(id)) dup.add(id);
    seen.add(id);
  }
  return dup;
}
