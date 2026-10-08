import "server-only";

import { listStudents } from "@/lib/db/queries";

// Privacy is a hard rule (spec Non-functional): no student name may ever appear
// in a prompt sent to the cloud CLI, and no name may survive in generated text.
// runClaude enforces the inbound direction (it throws if any forbiddenName is in
// the prompt). This module supplies that forbidden-name list and scrubs output.

const MIN_PART_LEN = 3;

// Ordinary words that legitimately appear in prompts, rubrics, and student
// work. A roster name TOKEN matching one of these (case-insensitive) is not
// individually forbidden — otherwise a single student named e.g.
// "Demo Student One" makes every prompt containing "student", "one" or "two"
// fail the inbound guard (the IA rubric alone uses "student" 17 times) and
// makes scrubOutput mangle those words in generated feedback. The student's
// FULL name is always still forbidden, so a real name containing one of these
// words is caught as a whole. Trade-off (accepted): a student whose family
// name is on this list is guarded only by the full-name entry and the
// pseudonymization that all prompts use anyway.
const COMMON_WORDS = new Set([
  // number words
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "twenty", "thirty", "forty", "fifty", "sixty",
  "seventy", "eighty", "ninety", "hundred", "thousand",
  "first", "second", "third", "fourth", "fifth", "half", "quarter",
  // function words (>= 3 chars; shorter ones are already dropped)
  "the", "and", "for", "are", "was", "were", "been", "being", "has", "have",
  "had", "not", "but", "all", "any", "each", "few", "more", "most", "other",
  "some", "such", "only", "own", "same", "very", "can", "could", "will",
  "would", "should", "must", "may", "might", "shall", "this", "that",
  "these", "those", "then", "than", "when", "where", "which", "while",
  "what", "who", "whose", "why", "how", "with", "from", "into", "over",
  "under", "between", "about", "above", "below", "after", "before",
  "during", "because", "both", "also", "does", "did", "done", "doing",
  "they", "them", "their", "there", "here", "she", "her", "him", "his",
  "you", "your", "yours", "our", "ours", "its", "out", "off", "per", "via",
  "use", "used", "using", "uses",
  // school / assessment vocabulary used throughout the pipeline prompts
  "student", "students", "teacher", "teachers", "class", "classes",
  "grade", "grades", "level", "levels", "mark", "marks", "marking",
  "marked", "score", "scores", "point", "points", "question", "questions",
  "answer", "answers", "page", "pages", "paper", "papers", "test", "tests",
  "exam", "exams", "task", "tasks", "criterion", "criteria", "band",
  "bands", "strand", "strands", "work", "working", "workings", "method",
  "methods", "step", "steps", "part", "parts", "total", "totals", "blank",
  "correct", "incorrect", "evidence", "feedback", "comment", "comments",
  "draft", "drafts", "final", "demo", "sample", "samples", "example",
  "examples", "placeholder", "delete", "solution", "solutions", "rubric",
  "rubrics", "unit", "units", "term", "terms", "year", "years", "week",
  "weeks", "target", "targets", "assessment", "assessments", "submission",
  "submissions", "exploration", "summary", "note", "notes", "name", "names",
  // math vocabulary common in transcriptions and mark schemes
  "math", "maths", "mathematics", "mathematical", "number", "numbers",
  "value", "values", "equation", "equations", "graph", "graphs", "table",
  "tables", "line", "lines", "area", "mean", "median", "mode", "range",
  "data", "sum", "angle", "angles", "degree", "degrees", "function",
  "functions", "model", "models", "result", "results",
]);

/**
 * Splits a full name into searchable parts (>= 3 chars). Short particles ("de",
 * "la", initials) are dropped: they cause too many false-positive matches in
 * ordinary words and carry little identifying signal on their own.
 */
export function nameParts(name: string): string[] {
  return name
    .split(/[\s,'.\-]+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= MIN_PART_LEN);
}

/**
 * Names to forbid for one pipeline operation: each roster name in scope as a
 * full name, plus EVERY name part >= 3 chars — first name AND every surname —
 * minus COMMON_WORDS.
 *
 * School policy (updated): a first name on its own is also NOT allowed to reach
 * the cloud AI, so first names are forbidden alongside surnames and the full
 * name. A single-part roster name (first name only) therefore contributes that
 * first name. Parts shorter than 3 chars are still dropped (they cause too many
 * false-positive matches and carry little identifying signal); a part equal to
 * a COMMON_WORD is dropped too, and is then covered only by the full-name entry
 * plus the pseudonymization every prompt already applies.
 *
 * This guard fails CLOSED (runClaude throws rather than send), so a first name
 * that collides with a word in a rubric or in the student's own work will block
 * that student's run until the word is added to COMMON_WORDS — the safe
 * direction under a stricter no-names rule.
 *
 * Pass the classId of the student being processed whenever the operation is
 * about a specific student. Prompts are built exclusively from that class's
 * data, so names from OTHER classes cannot appear in them by construction —
 * including the whole school roster only multiplies false positives (any one
 * roster name colliding with a common word used to block every pipeline for
 * every class). Operations with no class in scope (mark-scheme parse, cover
 * targets) omit it and get the full roster.
 */
export function getForbiddenNames(classId?: number): string[] {
  const students = listStudents(classId);
  const set = new Set<string>();
  for (const s of students) {
    const full = s.name.trim();
    if (full.length >= MIN_PART_LEN) set.add(full);
    for (const part of nameParts(s.name)) {
      if (!COMMON_WORDS.has(part.toLowerCase())) set.add(part);
    }
  }
  return [...set];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A name matcher bounded by Unicode letters rather than ASCII `\b`. JavaScript's
 * `\b` is ASCII-only, so `\bأحمد\b` never matches an Arabic name (and likewise for
 * Cyrillic, CJK, accented Latin, etc.). Bounding with `(?<!\p{L})…(?!\p{L})` under
 * the `u` flag means "not flanked by a letter in any script", which matches names
 * across scripts while still not firing inside a longer word.
 */
export function nameRegex(name: string, flags = "gi"): RegExp {
  return new RegExp(`(?<!\\p{L})${escapeRegExp(name)}(?!\\p{L})`, `${flags}u`);
}

export type ScrubResult = { text: string; warnings: string[] };

/**
 * Post-check on generated text: if any roster name leaked into the output, it is
 * replaced with the literal {{NAME}} token (the UI re-injects the real name
 * locally) and a warning is produced. Belt-and-braces on top of runClaude's
 * inbound guard — the model must address the student only as {{NAME}}.
 */
export function scrubOutput(text: string, forbiddenNames: string[]): ScrubResult {
  let out = text;
  const warnings: string[] = [];
  for (const rawName of forbiddenNames) {
    const name = rawName.trim();
    if (!name) continue;
    const pattern = nameRegex(name, "gi");
    if (pattern.test(out)) {
      out = out.replace(pattern, "{{NAME}}");
      warnings.push(
        `Privacy scrub: model output contained roster name "${name}"; replaced with {{NAME}}.`
      );
    }
  }
  return { text: out, warnings };
}
