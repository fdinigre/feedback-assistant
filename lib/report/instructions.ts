// The teacher's own instructions for how one assessment's reports are written. No
// server imports: the setup page and both report prompts use it.
//
// Two modes. "add" keeps the app's standard writing rules and puts the teacher's
// instructions after them (where the two disagree, the teacher's win). "replace"
// swaps the standard writing rules and report structure for the teacher's own.
// Either way a few things are fixed because the app depends on them: no student
// names, nothing invented, the {{NAME}} token, the JSON shape, the gem prompt and
// the ATL focus.

export type ReportInstructionsMode = "add" | "replace";

export const REPORT_INSTRUCTIONS_MAX_LENGTH = 3000;

/** What the standard instructions do, in a few lines, for the setup page. */
export const STANDARD_RULES_SUMMARY = [
  "Written for the student, in flowing prose, second person, without question numbers or point tallies.",
  "At most 4-5 strengths and 5-6 areas to work on, with next steps that carry over to the next assessments.",
  "A one-paragraph feedback comment of about 70-90 words in your own voice (from your style examples).",
  "A Toddle comment: a short introduction, then What went well / What to work on / Your next steps.",
  "A practice prompt for the student's maths gem, and an ATL focus where the evidence supports one.",
];

export function isReportInstructionsMode(value: unknown): value is ReportInstructionsMode {
  return value === "add" || value === "replace";
}

/** Trimmed text, or null when there is nothing to apply. */
export function cleanReportInstructions(text: unknown): string | null {
  const trimmed = String(text ?? "").replace(/\r\n/g, "\n").trim();
  return trimmed ? trimmed.slice(0, REPORT_INSTRUCTIONS_MAX_LENGTH) : null;
}

export type ReportInstructions = {
  text: string | null;
  mode: ReportInstructionsMode;
};

/** True when the teacher's text stands in for the standard rules. */
export function replacesStandardRules(i: ReportInstructions): boolean {
  return !!i.text && i.mode === "replace";
}

/**
 * The writing-rules part of a report prompt.
 *
 * `standardRules` is the app's own text, starting with its "WRITING RULES:" line.
 * `fixed` are the lines that still apply when the standard rules are replaced.
 */
export function composeWritingRules(args: {
  standardRules: string;
  instructions: ReportInstructions;
  fixed: { dataCorrelation: string; atl: string };
}): string {
  const { standardRules, instructions, fixed } = args;
  if (!instructions.text) return standardRules;

  if (instructions.mode === "add") {
    return `${standardRules}

TEACHER'S INSTRUCTIONS FOR THIS ASSESSMENT — the teacher's own, added to the rules above. Where they disagree with
a rule above, follow the teacher. They never override the privacy rule, the rule against inventing facts, or the
JSON shape you return.
${instructions.text}`;
  }

  return `WRITING RULES — the teacher has REPLACED the standard writing rules for this assessment with her own. Follow
these instructions for the style, length, content and structure of every section. They never override the
privacy rule, the rule against inventing facts, or the JSON shape you return.
${instructions.text}

STILL FIXED, because the tool depends on it:
- Data Correlation: ${fixed.dataCorrelation}
- Fill every field of the JSON below. Use the literal token {{NAME}} wherever the student is addressed by name.
  strengths, areasForImprovement and actionableSteps are arrays of strings (empty if the teacher's instructions
  leave one out); feedbackComment is the short comment for the student; toddleReport is the longer student-facing
  comment, one string with line breaks. Follow the teacher's instructions for how each one is written.
${fixed.atl}`;
}

/** The JSON shape's description of the two free-text fields: neutral when the standard rules are replaced. */
export function reportFieldHints(i: ReportInstructions): { feedbackComment: string; toddleReport: string } {
  return replacesStandardRules(i)
    ? {
        feedbackComment: "<the feedback comment, addressing {{NAME}}, as the teacher's instructions describe>",
        toddleReport: "<the longer student-facing Toddle comment, as the teacher's instructions describe>",
      }
    : {
        feedbackComment: "<single paragraph, ~70-90 words, addresses {{NAME}}>",
        toddleReport: "<multi-line student-facing comment in the shape described in rule 6>",
      };
}

/** The "REPORT STRUCTURE TO FOLLOW" block; left out when the teacher replaced the standard rules. */
export function reportStructureBlock(structure: string, i: ReportInstructions): string {
  return replacesStandardRules(i) ? "" : `REPORT STRUCTURE TO FOLLOW:\n${structure}\n\n`;
}
