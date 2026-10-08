/**
 * Proves that a line the teacher has taken out of the answer never reaches the
 * grader, and that the lines around it are renumbered without a gap.
 *
 * Run: npx tsx --conditions=react-server scripts/omitted-steps-check.ts
 */
import { renderResolvedTranscript } from "@/lib/pipeline/grade";
import type { TranscriptQuestion } from "@/lib/types";

const tq: TranscriptQuestion = {
  questionNumber: "1",
  blank: false,
  steps: [
    { text: "m = (3-0)/(4-2)", confident: true },
    { text: "scribbled working in the margin", confident: true, omitted: true },
    { text: "m = 3/2", confident: false },
    { text: "y = 1.5x - 3", confident: true },
  ],
  illegible: [{ stepIndex: 1, note: "could not read", resolvedText: undefined }],
};

const out = renderResolvedTranscript(tq);
console.log(out);

const problems: string[] = [];
if (out.includes("scribbled")) problems.push("the omitted line reached the grader");
if (out.includes("UNGRADEABLE")) problems.push("an omitted line was passed off as an illegible segment");
if (!/^ {2}1\. m = \(3-0\)/m.test(out)) problems.push("first line is not numbered 1");
if (!/^ {2}2\. m = 3\/2/m.test(out)) problems.push("lines were not renumbered after the omission");
if (!/^ {2}3\. y = 1\.5x - 3/m.test(out)) problems.push("third line is not numbered 3");
if (!out.includes("[low confidence]")) problems.push("low-confidence marker was lost");

console.log(problems.length === 0 ? "\nOK" : "\nFAILED:\n - " + problems.join("\n - "));
process.exit(problems.length === 0 ? 0 : 1);
