import "server-only";

import fs from "node:fs";
import path from "node:path";

import { toStoredPath } from "./file-paths";
import { getForbiddenNames, scrubOutput } from "@/lib/pipeline/guards";
import { runAi } from "@/lib/ai/provider";
import { runClaudeJson } from "@/lib/pipeline/run";
import { rasterizePdf } from "@/lib/pdf";
import { extractFileText } from "@/lib/assessment/extract-text";
import type { LevelBand } from "@/lib/types";

const PAPERS_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "papers");
const MAX_PAPER_CHARS = 12000;
const VALID_BANDS: LevelBand[] = ["1-2", "3-4", "5-6", "7-8"];

/** One question the tool proposes from the blank test paper, for the teacher to review/edit. */
export type ProposedQuestion = {
  number: string;
  maxPoints: number | null;
  levelBand: LevelBand | null;
  learningTarget: string | null;
};

/** One requirement of one band, as the task's achievement-level table prints it. */
export type ProposedDescriptor = {
  band: LevelBand;
  /** The strand label printed beside it ("i", "ii"), when the table numbers them. */
  strand: string | null;
  /** The official wording: "the student is able to ...". */
  text: string;
  /** The student-facing wording, where the table prints a second column of it. */
  studentText: string | null;
};

export type ProposedRubric = {
  /** The criterion the table names, when it names one. */
  criterion: string | null;
  descriptors: ProposedDescriptor[];
};

export type PaperExtractResult = {
  questions: ProposedQuestion[];
  /** Any student-facing learning targets printed on the cover, verbatim. */
  coverTargets: string[];
  /** The achievement-level table, where the task prints one. */
  rubric: ProposedRubric | null;
};

/** data/papers/<assessmentId>/paper.<ext> — the uploaded (blank) MYP test paper. */
export function saveMypPaper(assessmentId: number, originalName: string, bytes: Buffer): string {
  const dir = path.join(PAPERS_DIR, String(assessmentId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  for (const existing of fs.readdirSync(dir)) {
    if (existing.startsWith("paper.")) fs.rmSync(path.join(dir, existing));
  }
  const ext = path.extname(originalName).toLowerCase() || ".pdf";
  const dest = path.join(dir, `paper${ext}`);
  fs.writeFileSync(dest, bytes);
  return toStoredPath(dest);
}

/** data/papers/<assessmentId>/worked.<ext> — the uploaded worked-solutions / markscheme file. */
export function saveWorkedSolutionFile(
  assessmentId: number,
  originalName: string,
  bytes: Buffer
): string {
  const dir = path.join(PAPERS_DIR, String(assessmentId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  for (const existing of fs.readdirSync(dir)) {
    if (existing.startsWith("worked.")) fs.rmSync(path.join(dir, existing));
  }
  const ext = path.extname(originalName).toLowerCase() || ".pdf";
  const dest = path.join(dir, `worked${ext}`);
  fs.writeFileSync(dest, bytes);
  return toStoredPath(dest);
}

/** Local, deterministic text extraction of a worked-solutions file (no AI). For typed .docx. */
export async function extractWorkedSolutionText(filePath: string): Promise<string> {
  const pages = await extractFileText(filePath);
  return pages.join("\n\n").trim();
}

const WORKED_VISION_PROMPT = `You are reading a mathematics teacher's own WORKED SOLUTIONS / MARKSCHEME for
an MYP maths quiz. The pages are images (read them with your Read tool). The solutions are usually
HANDWRITTEN — working shown in one colour and the MARK ALLOCATIONS marked in another colour, often
as boxed numbers (e.g. a red "1" next to a step means one mark is awarded there). There are NO
student names anywhere in this document — it is the answer key.

Transcribe it into a clean, readable markscheme, organised by question and sub-part. For each
question:
- write out the worked solution steps as the teacher did (use plain text / simple notation, e.g.
  "d = sqrt((7-5)^2 + (2-3)^2) = sqrt(5)");
- state clearly WHERE marks are awarded and how many, matching the boxed marks (e.g.
  "A1 — correct substitution", "1 mark — final answer sqrt(5)");
- capture any method or follow-through notes the teacher wrote (e.g. "appropriate method",
  "using their slope", "other methods are fine as long as working is seen").

Do NOT invent content. If something is genuinely unreadable, write "[unclear]" rather than guess.
Output readable text with a heading per question. No preamble, just the markscheme.`;

/**
 * Reads a HANDWRITTEN (or diagram-heavy) worked-solutions PDF with vision: rasterizes the pages
 * and has the model transcribe them into a structured markscheme. This is the right tool when
 * plain text extraction would capture nothing (handwriting, coordinate diagrams, math notation).
 * The key has no student names, so getForbiddenNames() is a privacy backstop only.
 */
export async function extractWorkedSolutionsVision(
  pdfPath: string,
  outDir: string
): Promise<string> {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const imagePaths = await rasterizePdf(pdfPath, outDir);
  if (imagePaths.length === 0) {
    throw new Error("worked-solutions vision: the PDF produced no pages to read.");
  }
  const forbiddenNames = getForbiddenNames();
  const raw = await runAi({
    purpose: "myp-worked-solutions-vision",
    prompt: WORKED_VISION_PROMPT,
    imagePaths,
    forbiddenNames,
  });
  return scrubOutput(raw.trim(), forbiddenNames).text;
}

function buildPrompt(paperText: string): string {
  return `You are reading a blank MYP (Middle Years Programme) mathematics test paper — the question
paper only, with NO student work and NO markscheme. Your job is to propose a structured question
list that the teacher will review and edit before grading.

--- PAPER TEXT START ---
${paperText}
--- PAPER TEXT END ---

Extract every distinct question (and sub-question, e.g. "1", "2a", "2b", "3") in the order it
appears. For each, provide:
- "number": the question label as printed (string).
- "maxPoints": the marks/points for that question IF printed on the paper (e.g. "[3 marks]",
  "(2)"). Marks are often printed once for a whole section or question rather than per part —
  e.g. "PART B — Calculation (3 × 3 pts)" means each of B1, B2, B3 is worth 3, and "C1. ... (5 points)"
  means C1 is worth 5. Apply such headers to every question they cover. Where a question's parts
  (a), (b), (c) share one printed total and no per-part marks, keep the question as ONE item
  (e.g. "B1", 3 points) rather than inventing a split. If no marks are shown anywhere, use null.
- "levelBand": your best guess of the MYP achievement band this question targets, based on its
  cognitive demand, and ONLY one of exactly these strings: "1-2" (recall / simple procedure),
  "3-4" (routine application), "5-6" (multi-step / less familiar), "7-8" (unfamiliar / justify /
  prove / generalise). If you genuinely cannot tell, use null — the teacher will set it.
- "learningTarget": a concise, student-facing learning target describing what the question
  assesses (e.g. "Solve right-angled triangles using trigonometric ratios"). If the paper prints
  explicit learning targets/objectives, prefer that wording. If you cannot tell, use null.

Also return "coverTargets": an array of any student-facing learning targets/objectives printed on
the paper's cover (verbatim), or an empty array if none.

Also return "rubric": the achievement-level table, if the paper prints one (a table of levels
1-2 / 3-4 / 5-6 / 7-8 against what the student has to do). Many MYP tasks print two columns for
it: the official descriptor ("The student is able to: i. ... ii. ...") and a student-facing
restatement ("You are able to ..."). SPLIT EACH BAND INTO ONE ENTRY PER REQUIREMENT — a band
descriptor that says "describe the patterns as general rules. Verify and justify their validity"
is TWO entries, not one. For each entry give:
- "band": one of "1-2", "3-4", "5-6", "7-8".
- "strand": the strand label printed beside it ("i", "ii", "iii"), or null if the table does not
  number them. Keep the same label the paper uses, so the same strand can be followed from one
  band to the next.
- "text": the official wording, verbatim and without the leading numeral.
- "studentText": the matching student-facing sentence if the table has that second column, else null.
Also give "criterion": the criterion letter the table is for ("B", "C", "D") if the paper says so,
else null. If the paper prints no such table, return "rubric": null — do NOT invent descriptors.

NEVER guess a question that is not clearly present. Return ONLY strict JSON, no prose, no code
fences:
{
  "questions": [
    { "number": "<string>", "maxPoints": <number|null>, "levelBand": "<1-2|3-4|5-6|7-8|null>", "learningTarget": "<string|null>" }
  ],
  "coverTargets": ["<string>", ...],
  "rubric": { "criterion": "<B|C|D|null>",
              "descriptors": [ { "band": "<1-2|3-4|5-6|7-8>", "strand": "<string|null>", "text": "<string>", "studentText": "<string|null>" } ] }
}`;
}

function coerceBand(value: unknown): LevelBand | null {
  const s = String(value ?? "").trim();
  return (VALID_BANDS as string[]).includes(s) ? (s as LevelBand) : null;
}

function coercePoints(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const PAPER_VISION_PROMPT = `You are reading a blank mathematics test paper — the question paper only,
with NO student work and NO answers. The pages are images (read them with your Read tool). There are
no student names anywhere in this document.

Transcribe the paper faithfully into plain text, in reading order: every question and sub-question
with its label exactly as printed (e.g. "3", "3a", "B2 (c)"), the full question text, any answer
options for multiple-choice items, any marks shown ("[3 marks]", "(2)"), and any headings such as
"Part A — Multiple Choice (12 × 1 pt)". Use simple notation for maths (e.g. "A = P(1 + r/n)^(nt)").
Do NOT invent content and do NOT answer the questions. If something is unreadable, write "[unclear]".
No preamble, just the transcription.`;

/**
 * The paper as text: extracted directly from a typed PDF/.docx, or read with
 * vision when the file is a scan with no text layer. A scanned blank test is
 * the normal case for the Financial Math course, whose tests are photocopied.
 */
export async function readPaperText(paperPath: string): Promise<{ text: string; usedVision: boolean }> {
  if (!fs.existsSync(paperPath)) {
    throw new Error(`paper-extract: file not found at ${paperPath}`);
  }
  const pages = await extractFileText(paperPath);
  const direct = pages.join("\n\n").trim();
  if (direct) return { text: direct, usedVision: false };

  if (!paperPath.toLowerCase().endsWith(".pdf")) {
    throw new Error("paper-extract: no text could be read from the paper.");
  }
  const outDir = path.join(path.dirname(paperPath), "paper-pages");
  const imagePaths = await rasterizePdf(paperPath, outDir);
  if (imagePaths.length === 0) {
    throw new Error("paper-extract: the PDF produced no pages to read.");
  }
  const forbiddenNames = getForbiddenNames();
  const raw = await runAi({
    purpose: "myp-paper-vision",
    prompt: PAPER_VISION_PROMPT,
    imagePaths,
    forbiddenNames,
  });
  const text = scrubOutput(raw.trim(), forbiddenNames).text;
  if (!text) throw new Error("paper-extract: the scanned paper could not be read.");
  return { text, usedVision: true };
}

/**
 * Extracts a proposed question list + cover learning targets from a blank MYP test paper.
 * Pure read — persists nothing; the caller creates draft questions the teacher then edits.
 * The paper has no student names, so getForbiddenNames() here is only a privacy backstop.
 */
export async function extractMypPaper(paperPath: string): Promise<PaperExtractResult> {
  const paperText = (await readPaperText(paperPath)).text.slice(0, MAX_PAPER_CHARS);

  const parsed = await runClaudeJson<{
    questions?: unknown;
    coverTargets?: unknown;
    rubric?: unknown;
  }>({
    purpose: "myp-paper-extract",
    prompt: buildPrompt(paperText),
    forbiddenNames: getForbiddenNames(),
  });

  const questions: ProposedQuestion[] = Array.isArray(parsed.questions)
    ? (parsed.questions as Record<string, unknown>[])
        .map((q) => ({
          number: String(q.number ?? "").trim(),
          maxPoints: coercePoints(q.maxPoints),
          levelBand: coerceBand(q.levelBand),
          learningTarget: q.learningTarget ? String(q.learningTarget).trim() || null : null,
        }))
        .filter((q) => q.number)
    : [];

  const coverTargets = Array.isArray(parsed.coverTargets)
    ? parsed.coverTargets.map((t) => String(t).trim()).filter(Boolean)
    : [];

  return { questions, coverTargets, rubric: coerceRubric(parsed.rubric) };
}

/** Keeps only entries with a band this app knows and a non-empty statement. */
function coerceRubric(value: unknown): ProposedRubric | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { criterion?: unknown; descriptors?: unknown };
  if (!Array.isArray(raw.descriptors)) return null;

  const descriptors: ProposedDescriptor[] = (raw.descriptors as Record<string, unknown>[])
    .map((d) => ({
      band: coerceBand(d.band),
      strand: d.strand ? String(d.strand).trim() || null : null,
      text: String(d.text ?? "").trim(),
      studentText: d.studentText ? String(d.studentText).trim() || null : null,
    }))
    .filter((d): d is ProposedDescriptor => d.band !== null && d.text !== "");
  if (descriptors.length === 0) return null;

  const criterion = String(raw.criterion ?? "").trim().toUpperCase();
  return {
    criterion: criterion === "B" || criterion === "C" || criterion === "D" ? criterion : null,
    descriptors,
  };
}
