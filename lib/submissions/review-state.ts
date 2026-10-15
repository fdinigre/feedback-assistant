import type { IllegibleFlag, TranscriptQuestion } from "@/lib/types";

// What is still outstanding on a transcribed question, as the review screen shows it.
// A leaf module with no "server-only": the marks strip, the question panel, the
// grading gate and the dashboard all decide from this, and must agree.
//
// Only one thing is the teacher's job before grading: a part the AI could not read,
// which it writes as "[?]" in the line and flags. That is orange everywhere and
// grading waits for it.
//
// Everything else the AI was unsure of is shown lightly as worth a glance and never
// holds anything up: a line it read with low confidence, and — far more common — a
// flag on a line it did read in full (a struck-out symbol beside it, a letter it
// half-recognised), whose text has no "[?]" in it. Grading takes such a line as
// written. Making those orange too put over a thousand readable lines in the way.

/** A flag the teacher must still settle before grading: open, on a line in the answer that still shows a "[?]". */
export function flagBlocks(transcript: TranscriptQuestion, flag: IllegibleFlag): boolean {
  const step = transcript.steps[flag.stepIndex];
  if (!step || step.omitted) return false;
  return flag.resolvedText === undefined && step.text.includes("[?]");
}

/** Every flag on the question that grading waits for. */
export function blockingFlags(transcript: TranscriptQuestion): IllegibleFlag[] {
  return transcript.illegible.filter((f) => flagBlocks(transcript, f));
}

/** A line with an unreadable part ("[?]") the teacher still has to fix or mark unreadable — grading waits for it. */
export function stepNeedsCheck(transcript: TranscriptQuestion, index: number): boolean {
  return transcript.illegible.some((f) => f.stepIndex === index && flagBlocks(transcript, f));
}

/**
 * A line worth a glance, never required: one the AI read with low confidence, or
 * one it flagged although every part of it was read. Settled once the teacher edits
 * the line or uses it as it is.
 */
export function stepIsUncertain(transcript: TranscriptQuestion, index: number): boolean {
  const step = transcript.steps[index];
  if (!step || step.omitted || stepNeedsCheck(transcript, index)) return false;
  const flags = transcript.illegible.filter((f) => f.stepIndex === index);
  if (flags.some((f) => f.resolvedText === undefined)) return true;
  return !step.confident && flags.length === 0;
}

/** Whether a question has anything the teacher must still do before grading: an unreadable part. */
export function questionNeedsReview(transcript: TranscriptQuestion | undefined): boolean {
  if (!transcript) return false;
  return blockingFlags(transcript).length > 0;
}
