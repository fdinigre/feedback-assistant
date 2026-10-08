// Sub-part reconciliation for transcripts.
//
// This module is intentionally PURE (no "server-only", no DB/AI imports) so it
// can be unit-tested standalone via `npx tsx scripts/test-pipeline-parse.mts`,
// which runs outside Next's bundler where the server-only guard would throw.
//
// The transcription model sometimes splits a question into sub-parts that the
// assessment definition doesn't have (definition: "4"; model: "4a" + "4b").
// Rather than silently dropping that work, we merge the sub-part steps back
// under the parent question — or, when we can't merge safely, surface the
// transcribed sub-part numbers so the teacher gets a specific warning instead
// of a generic "not found".

import type { IllegibleFlag, TranscriptQuestion, TranscriptStep } from "../types";

export type SubPartReconciliation =
  /** Letter sub-parts found — steps merged under the parent, in a/b/c order. */
  | { kind: "merged"; question: TranscriptQuestion; from: string[] }
  /** Sub-part-looking numbers found (e.g. "4ii") that the merge doesn't handle. */
  | { kind: "unmergeable"; keys: string[] }
  /** Nothing in the model output relates to this question. */
  | { kind: "none" };

/**
 * Extracts the sub-part letter from `key` when it is `parent` plus a single
 * letter with optional separators: "4a", "4(a)", "4.a", "4 a". Returns null
 * for anything else (including "40a", which starts with "4" but belongs to 40).
 */
function subPartLetter(key: string, parent: string): string | null {
  if (!key.startsWith(parent)) return null;
  const rest = key.slice(parent.length);
  const m = rest.match(/^\s*[.\-(]?\s*([a-zA-Z])\)?$/);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Reconciles a definition question that the model did not return directly
 * against sub-parts it may have returned instead. Numbers that are themselves
 * defined questions are never treated as sub-parts of another question.
 */
export function reconcileSubParts(
  parent: string,
  byNumber: Map<string, TranscriptQuestion>,
  definedNumbers: Set<string>
): SubPartReconciliation {
  const letterParts: { key: string; letter: string; question: TranscriptQuestion }[] = [];
  const otherKeys: string[] = [];

  for (const [key, question] of byNumber) {
    if (key === parent || definedNumbers.has(key) || !key.startsWith(parent)) continue;
    const rest = key.slice(parent.length);
    // A digit suffix means a different question entirely ("4" vs "41").
    if (rest.length === 0 || /^\d/.test(rest)) continue;
    const letter = subPartLetter(key, parent);
    if (letter) letterParts.push({ key, letter, question });
    else otherKeys.push(key);
  }

  if (letterParts.length > 0) {
    // Merge in a/b/c order regardless of the order the model emitted them.
    letterParts.sort((a, b) => a.letter.localeCompare(b.letter));

    const steps: TranscriptStep[] = [];
    const illegible: IllegibleFlag[] = [];
    for (const part of letterParts) {
      const offset = steps.length;
      const partSteps = Array.isArray(part.question.steps) ? part.question.steps : [];
      partSteps.forEach((s, i) => {
        const text = String(s?.text ?? "");
        steps.push({
          // The first step of each block carries the sub-part label so the
          // teacher can still see where "a)" ends and "b)" begins.
          text: i === 0 ? `${part.letter}) ${text}` : text,
          confident: Boolean(s?.confident),
        });
      });
      const flags = Array.isArray(part.question.illegible) ? part.question.illegible : [];
      for (const f of flags) {
        illegible.push({ ...f, stepIndex: Number(f?.stepIndex ?? 0) + offset });
      }
    }

    return {
      kind: "merged",
      question: { questionNumber: parent, steps, illegible, blank: steps.length === 0 },
      from: letterParts.map((p) => p.key),
    };
  }

  if (otherKeys.length > 0) return { kind: "unmergeable", keys: otherKeys.sort() };
  return { kind: "none" };
}
