import type { TranscriptQuestion } from "@/lib/types";

// The teacher's edits to a transcribed question, as the review screens make them.
// A leaf module with no "server-only": MYP and DP both edit through these, so a
// line fixed on one screen settles exactly as it would on the other — and since
// every edit now saves itself, each one has to leave the transcript in a state
// that is right to store as it stands.

/** Text a flag can take as its resolution: something, and no "[?]" left in it. */
function usable(text: string): boolean {
  return text.trim() !== "" && !text.includes("[?]");
}

/**
 * A line's text changed. The line is the teacher's now, so it is no longer the
 * model's doubtful reading (confident). An unreadable part on it is resolved by the
 * corrected text once no "[?]" is left — she never retypes it in the flag's box.
 * Text that still holds a "[?]", or nothing at all, resolves nothing: emptying a
 * line is how she says it does not belong, which is what "Not part of the answer"
 * is for. A resolution that came from this line's old text goes back to waiting.
 */
export function editStepText(t: TranscriptQuestion, stepIndex: number, text: string): TranscriptQuestion {
  const before = t.steps[stepIndex]?.text;
  const steps = t.steps.map((s, i) => (i === stepIndex ? { ...s, text, confident: true } : s));
  const illegible = t.illegible.map((f) => {
    if (f.stepIndex !== stepIndex) return f;
    if (usable(text)) return { ...f, resolvedText: text };
    if (f.resolvedText !== undefined && f.resolvedText !== "" && f.resolvedText === before) {
      return { stepIndex: f.stepIndex, note: f.note };
    }
    return f;
  });
  return { ...t, steps, illegible };
}

/** How transcription marks a line the student struck through. */
const CROSSED_OUT = /^\s*\[crossed out\]\s*/i;

export function isCrossedOut(text: string): boolean {
  return CROSSED_OUT.test(text);
}

/**
 * Every line the student crossed out, taken out of the answer: the student rejected
 * it, so it is never marked — the same as the teacher pressing "Not part of the
 * answer" on it. The text stays on record, struck through.
 */
export function omitCrossedOut(t: TranscriptQuestion): TranscriptQuestion {
  if (!t.steps.some((s) => !s.omitted && isCrossedOut(s.text))) return t;
  return { ...t, steps: t.steps.map((s) => (!s.omitted && isCrossedOut(s.text) ? { ...s, omitted: true } : s)) };
}

/**
 * Take a line out of the answer, or put it back. Putting back a line that was
 * crossed out drops the "[crossed out]" mark too: the teacher is saying it counts, and
 * left marked it would still earn nothing.
 */
export function toggleStepOmitted(t: TranscriptQuestion, stepIndex: number): TranscriptQuestion {
  return {
    ...t,
    steps: t.steps.map((s, i) => {
      if (i !== stepIndex) return s;
      if (!s.omitted) return { ...s, omitted: true };
      return { ...s, omitted: false, text: s.text.replace(CROSSED_OUT, "") };
    }),
  };
}

/**
 * What an unreadable part says, typed in its flag's box. An empty box is still
 * waiting — not "unreadable": clearing the box to retype it must not record a
 * no-credit decision the moment it saves. "Mark unreadable" is that decision.
 */
export function resolveFlag(t: TranscriptQuestion, flagIndex: number, text: string): TranscriptQuestion {
  return {
    ...t,
    illegible: t.illegible.map((f, i) =>
      i !== flagIndex ? f : text.trim() === "" ? { stepIndex: f.stepIndex, note: f.note } : { ...f, resolvedText: text }
    ),
  };
}

/** The teacher's word that this part cannot be read: it earns no credit. */
export function markFlagUnreadable(t: TranscriptQuestion, flagIndex: number): TranscriptQuestion {
  return { ...t, illegible: t.illegible.map((f, i) => (i === flagIndex ? { ...f, resolvedText: "" } : f)) };
}

/**
 * The flagged line is right as it reads: its text is the resolution, and the line
 * is the teacher's. A line still showing "[?]" cannot be used as it is — that part
 * is unreadable, which is the other button.
 */
export function acceptLineAsIs(t: TranscriptQuestion, flagIndex: number): TranscriptQuestion {
  const flag = t.illegible[flagIndex];
  const text = flag ? t.steps[flag.stepIndex]?.text ?? "" : "";
  if (!flag || !usable(text)) return t;
  return {
    ...t,
    steps: t.steps.map((s, i) => (i === flag.stepIndex ? { ...s, confident: true } : s)),
    illegible: t.illegible.map((f, i) => (i === flagIndex ? { ...f, resolvedText: text } : f)),
  };
}

/** Whether "use as it is" makes sense for this flag: open, and its line reads in full. */
export function canUseLineAsIs(t: TranscriptQuestion, flagIndex: number): boolean {
  const flag = t.illegible[flagIndex];
  return !!flag && flag.resolvedText === undefined && usable(t.steps[flag.stepIndex]?.text ?? "");
}

/**
 * The whole question accepted as it stands — what the old Save button did. Every
 * open flag is settled from its line: a line that reads in full is used as written,
 * a line still showing "[?]" counts as unreadable (no credit). Every line in the
 * answer is the teacher's now. Lines taken out of the answer are left as they are.
 */
export function acceptQuestionAsIs(t: TranscriptQuestion): TranscriptQuestion {
  return {
    ...t,
    steps: t.steps.map((s) => (s.omitted ? s : { ...s, confident: true })),
    illegible: t.illegible.map((f) => {
      if (f.resolvedText !== undefined) return f;
      const step = t.steps[f.stepIndex];
      if (!step || step.omitted) return f;
      return { ...f, resolvedText: usable(step.text) ? step.text : "" };
    }),
  };
}
