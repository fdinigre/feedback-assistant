import "server-only";

import { displayStoredPath, resolveStoredPath } from "@/lib/assessment/file-paths";

import { getAssessment, listQuestions } from "@/lib/db/queries";
import { getForbiddenNames } from "@/lib/pipeline/guards";
import { runClaudeJson } from "@/lib/pipeline/run";
import { extractFileText } from "@/lib/assessment/extract-text";

export type CoverTargetsResult = {
  /** Student-facing learning targets found on the cover, verbatim (spec P5). Empty if unreadable. */
  targets: string[];
  /** Proposed question -> target mapping, one entry per question the tool is confident about. */
  mapping: { questionNumber: string; target: string }[];
};

const MAX_COVER_PAGES = 3;
const MAX_COVER_CHARS = 6000;

function buildPrompt(coverText: string, questionNumbers: string[]): string {
  const questionList =
    questionNumbers.length > 0
      ? questionNumbers.map((n) => `- Question ${n}`).join("\n")
      : "(question list not available yet — propose targets only, leave mapping empty)";

  return `You are reading the cover page(s) of an IB Diploma Programme mathematics exam paper to
extract the student-facing learning targets printed there (often under a heading like
"Learning objectives" or "By the end of this assessment you should be able to:").

--- COVER TEXT START ---
${coverText}
--- COVER TEXT END ---

THE ASSESSMENT HAS THESE QUESTIONS:
${questionList}

TASK:
1. Extract each distinct learning target as printed (verbatim, one per line/bullet). If the cover
   has no readable learning targets, return an empty "targets" array — do not invent any.
2. For each question above, if you can confidently tell which target(s) it primarily assesses
   from the question numbers/topics named alongside the targets on the cover, propose ONE target
   string (must exactly match an entry in "targets") for that question. Skip questions you are not
   confident about — omit them from "mapping" rather than guessing.

Return ONLY strict JSON, no prose, no code fences:
{
  "targets": ["<target text>", ...],
  "mapping": [ { "questionNumber": "<string>", "target": "<must match a targets entry>" }, ... ]
}`;
}

/**
 * Given a list of learning targets the teacher typed in, proposes which target each question
 * primarily assesses — by reading the exam paper's question text. Used when the targets were
 * entered manually (so there was no cover extraction to produce a mapping). Returns only the
 * mapping; the caller applies it and the teacher confirms/adjusts each one.
 */
export async function matchTargetsToQuestions(
  assessmentId: number,
  targets: string[]
): Promise<{ questionNumber: string; target: string }[]> {
  const assessment = getAssessment(assessmentId);
  if (!assessment) throw new Error(`match-targets: assessment ${assessmentId} not found`);
  const cleanTargets = targets.map((t) => t.trim()).filter(Boolean);
  if (cleanTargets.length === 0) throw new Error("match-targets: no learning targets to match.");
  const matchPaperPath = resolveStoredPath(assessment.paper_file);
  if (!matchPaperPath) {
    throw new Error("match-targets: upload the exam paper first so questions can be matched.");
  }
  const questionNumbers = listQuestions(assessmentId).map((q) => q.number);
  if (questionNumbers.length === 0) throw new Error("match-targets: no questions yet.");

  const pages = await extractFileText(matchPaperPath);
  const paperText = pages.join("\n\n").slice(0, 12000);
  const targetList = cleanTargets.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const questionList = questionNumbers.map((n) => `- Question ${n}`).join("\n");

  const prompt = `You are matching each question of an IB DP mathematics exam to the learning target it
primarily assesses. Here are the teacher's learning targets:
${targetList}

Here is the exam paper text:
--- PAPER START ---
${paperText}
--- PAPER END ---

THE QUESTIONS TO MAP:
${questionList}

For each question, choose the ONE target from the list above that it primarily assesses (the target
text must be copied EXACTLY from the list). Skip a question only if you genuinely cannot tell — omit
it rather than guess.

Return ONLY strict JSON, no prose, no code fences:
{ "mapping": [ { "questionNumber": "<string>", "target": "<exact target text>" }, ... ] }`;

  const parsed = await runClaudeJson<{ mapping?: unknown }>({
    purpose: "dp-match-targets",
    prompt,
    forbiddenNames: getForbiddenNames(),
  });
  const targetSet = new Set(cleanTargets);
  return Array.isArray(parsed.mapping)
    ? (parsed.mapping as { questionNumber?: unknown; target?: unknown }[])
        .map((m) => ({
          questionNumber: String(m.questionNumber ?? "").trim(),
          target: String(m.target ?? "").trim(),
        }))
        .filter((m) => m.questionNumber && targetSet.has(m.target))
    : [];
}

/**
 * Extracts learning targets from the DP paper's cover page(s) and proposes a question -> target
 * mapping (spec P5). Does not persist anything — the caller (setup action) decides how to store
 * the result and the teacher confirms/edits it in the UI.
 */
export async function extractCoverTargets(assessmentId: number): Promise<CoverTargetsResult> {
  const assessment = getAssessment(assessmentId);
  if (!assessment) throw new Error(`cover-targets: assessment ${assessmentId} not found`);
  if (!assessment.paper_file) {
    throw new Error(`cover-targets: assessment ${assessmentId} has no paper file uploaded`);
  }
  const paperPath = resolveStoredPath(assessment.paper_file);
  if (!paperPath) {
    throw new Error(
      `cover-targets: the uploaded paper is missing from data/ (recorded as "${displayStoredPath(
        assessment.paper_file
      )}"). Upload it again in setup.`
    );
  }

  const pages = await extractFileText(paperPath);
  const coverText = pages.slice(0, MAX_COVER_PAGES).join("\n\n").slice(0, MAX_COVER_CHARS);
  const questionNumbers = listQuestions(assessmentId).map((q) => q.number);

  const forbiddenNames = getForbiddenNames();
  const prompt = buildPrompt(coverText, questionNumbers);
  const parsed = await runClaudeJson<{
    targets?: unknown;
    mapping?: unknown;
  }>({ purpose: "dp-cover-targets", prompt, forbiddenNames });

  const targets = Array.isArray(parsed.targets)
    ? parsed.targets.map((t) => String(t).trim()).filter(Boolean)
    : [];
  const targetSet = new Set(targets);
  const mapping = Array.isArray(parsed.mapping)
    ? (parsed.mapping as { questionNumber?: unknown; target?: unknown }[])
        .map((m) => ({ questionNumber: String(m.questionNumber ?? "").trim(), target: String(m.target ?? "").trim() }))
        .filter((m) => m.questionNumber && targetSet.has(m.target))
    : [];

  return { targets, mapping };
}
