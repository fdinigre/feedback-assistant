import type { TranscriptQuestion } from "@/lib/types";

// What is still outstanding on a transcribed question, as the review screen shows it.
// A leaf module with no "server-only": the marks strip and the question panel both
// colour from this, and they must agree about what is still open.
//
// "Low confidence" is the model's own doubt about a step it read. It stops being the
// teacher's problem once something settles it: an illegible flag she has resolved
// carries the text she confirmed, and saving a question records that she has been
// through its steps. Without that, a question she had already fixed stayed amber for
// the rest of the assessment's life.

/** A step the teacher still has to check against the scan. */
export function stepNeedsCheck(transcript: TranscriptQuestion, index: number): boolean {
  const step = transcript.steps[index];
  // A line she has taken out of the answer needs no checking: she has already
  // looked at it and decided it is not part of the work.
  if (!step || step.confident || step.omitted) return false;
  const flag = transcript.illegible.find((f) => f.stepIndex === index);
  return !flag || flag.resolvedText === undefined;
}

/** Whether a question has anything left for the teacher: an open flag, or an unsettled step. */
export function questionNeedsReview(transcript: TranscriptQuestion | undefined): boolean {
  if (!transcript) return false;
  if (
    transcript.illegible.some(
      (f) => f.resolvedText === undefined && !transcript.steps[f.stepIndex]?.omitted
    )
  )
    return true;
  return transcript.steps.some((_, index) => stepNeedsCheck(transcript, index));
}
