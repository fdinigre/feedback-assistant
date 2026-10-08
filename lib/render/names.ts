// Re-injects the real student name into AI-generated text.
//
// All generated text (transcripts, gradings, reports) addresses the student
// with the literal tokens {{NAME}} / {{FIRSTNAME}} — the pipeline never sees
// real names (privacy hard rule). This module performs the local
// substitution at render/export time only.

import type { ReportSections } from "@/lib/types";

/** First token of a full name, e.g. "Alex Morgan" -> "Alex". */
export function firstNameOf(studentName: string): string {
  const trimmed = studentName.trim();
  return trimmed.split(/\s+/)[0] || trimmed;
}

/**
 * Replaces every name token with the student's FIRST name, and does the same for
 * the pseudonym — AI-generated prose may refer to the student by pseudonym, and
 * what the teacher reads, copies into Toddle or hands to the student must show a
 * real name.
 *
 * First name only, everywhere: this text speaks to the student ("you continued
 * the pattern"), and a surname in the middle of it reads like a disciplinary
 * note. Passing a full name here is fine — it is reduced to the first name.
 */
export function injectName(text: string, studentName: string, pseudonym?: string): string {
  if (!text) return text;
  const firstName = firstNameOf(studentName);
  let out = text.split("{{NAME}}").join(firstName).split("{{FIRSTNAME}}").join(firstName);
  if (pseudonym) out = out.split(pseudonym).join(firstName);
  return out;
}

function injectNameNullable(
  text: string | null,
  studentName: string,
  pseudonym?: string
): string | null {
  return text === null ? null : injectName(text, studentName, pseudonym);
}

/** Applies injectName across every string field of a ReportSections object. */
export function injectNameSections(
  sections: ReportSections,
  studentName: string,
  pseudonym?: string
): ReportSections {
  return {
    dataCorrelation: injectNameNullable(sections.dataCorrelation, studentName, pseudonym),
    strengths: sections.strengths.map((s) => injectName(s, studentName, pseudonym)),
    areasForImprovement: sections.areasForImprovement.map((s) =>
      injectName(s, studentName, pseudonym)
    ),
    actionableSteps: sections.actionableSteps.map((s) => injectName(s, studentName, pseudonym)),
    feedbackComment: injectName(sections.feedbackComment, studentName, pseudonym),
    toddleReport: injectName(sections.toddleReport ?? "", studentName, pseudonym),
  };
}
