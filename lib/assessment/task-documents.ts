import "server-only";

import fs from "node:fs";
import path from "node:path";

import { listTaskDocuments } from "@/lib/db/queries";
import { getForbiddenNames, nameRegex, scrubOutput } from "@/lib/pipeline/guards";
import { runAi } from "@/lib/ai/provider";
import { runClaudeJson } from "@/lib/pipeline/run";
import { rasterizePdf } from "@/lib/pdf";
import { extractFileText } from "./extract-text";
import { toStoredPath } from "./file-paths";
import {
  coerceRubric,
  RUBRIC_SPLIT_RULES,
  WORKED_VISION_PROMPT,
  type ProposedRubric,
} from "./paper-extract";
import {
  MAX_DOC_CHARS_FOR_GRADING,
  RUBRIC_SOURCE_KINDS,
  TASK_DOCUMENT_LABELS,
} from "./task-document-kinds";
import type { TaskDocumentKind, TaskDocumentRow } from "@/lib/types";

const PAPERS_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "papers");

/** data/papers/<assessmentId>/docs/<stamp>-<name> — kept beside the paper and key. */
export function saveTaskDocumentFile(assessmentId: number, originalName: string, bytes: Buffer): string {
  const dir = path.join(PAPERS_DIR, String(assessmentId), "docs");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(originalName).toLowerCase();
  const base = path
    .basename(originalName, path.extname(originalName))
    .replace(/[^A-Za-z0-9 ._-]+/g, "")
    .trim()
    .slice(0, 80) || "document";
  const dest = path.join(dir, `${Date.now()}-${base}${ext}`);
  fs.writeFileSync(dest, bytes);
  return toStoredPath(dest);
}

const DOCUMENT_VISION_PROMPT = `You are reading a document a mathematics teacher uses to set or mark a task:
a task sheet, a template, a rubric or checklist, an example of work, or guidance. The pages are images
(read them with your Read tool).

Transcribe it faithfully into plain text, in reading order: headings, instructions, every table row by
row (separate the columns with " | "), and any mathematics in simple notation (e.g. "C = 330n + 5950").
Describe each graph, diagram or picture in one bracketed line — what it shows, its axis labels and
scales, any labelled points — e.g. "[graph: two lines, x-axis 'number of people' ...]".
Do NOT invent content and do NOT answer anything. Write "[unclear]" for anything unreadable. If a
person's name appears, write "[name]" instead of it. No preamble, just the transcription.`;

/**
 * The text of an uploaded task document: straight from a typed PDF or .docx, or
 * read with vision when the PDF is a scan with no text layer. A scanned key goes
 * through the worked-solutions reading, which knows about boxed marks.
 */
export async function readTaskDocument(
  absolutePath: string,
  kind: TaskDocumentKind
): Promise<{ text: string; usedVision: boolean }> {
  const direct = (await extractFileText(absolutePath)).join("\n\n").trim();
  if (direct) return { text: direct, usedVision: false };
  if (path.extname(absolutePath).toLowerCase() !== ".pdf") return { text: "", usedVision: false };
  return { text: await readTaskDocumentPages(absolutePath, kind), usedVision: true };
}

/**
 * A PDF document read by the AI from its page images. Uploading only does this for
 * a scan with no text at all; a key typed out and then worked by hand has a text
 * layer, so the upload kept its typed words and lost every answer. The teacher asks
 * for this read from the document's row, and checks what comes back.
 */
export async function readTaskDocumentPages(absolutePath: string, kind: TaskDocumentKind): Promise<string> {
  const outDir = path.join(path.dirname(absolutePath), `${path.basename(absolutePath)}-pages`);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const imagePaths = await rasterizePdf(absolutePath, outDir);
  if (imagePaths.length === 0) return "";
  const forbiddenNames = getForbiddenNames();
  const raw = await runAi({
    purpose: "task-document-vision",
    prompt: kind === "solution" ? WORKED_VISION_PROMPT : DOCUMENT_VISION_PROMPT,
    imagePaths,
    forbiddenNames,
  });
  return scrubOutput(raw.trim(), forbiddenNames).text;
}

/**
 * Takes every roster name out of a document's text before it is stored.
 *
 * Task documents go into every student's grading prompt, and the privacy guard
 * refuses to send a prompt carrying a roster name — so one name left in an
 * exemplar would stop the whole class from being graded. Better to remove it
 * here, where the teacher sees it happen, than to fail later out of sight.
 */
export function removeRosterNames(text: string): { text: string; removed: string[] } {
  let out = text;
  const removed: string[] = [];
  // Longest first, so a full name goes as one rather than leaving its surname behind.
  const names = getForbiddenNames().sort((a, b) => b.length - a.length);
  for (const name of names) {
    const pattern = nameRegex(name, "gi");
    if (pattern.test(out)) {
      out = out.replace(pattern, "[name]");
      removed.push(name);
    }
  }
  return { text: out, removed };
}

/**
 * How the grader is to read each kind. The template and the exemplar are the two
 * that would mislead it otherwise: a heading or price list left standing from the
 * template is not the student's writing, and an exemplar shows a standard, not the
 * one route to it.
 */
const KIND_GUIDANCE: Record<TaskDocumentKind, string> = {
  task: "What the students were asked to do. Its requirements are what a complete piece of work answers.",
  template:
    "The starting document the students were given. Any heading, prompt, table, picture or figure that comes from it is NOT the student's own work — a heading or price list still standing in their work was handed to them. Never credit a student for it; credit only what they added.",
  rubric:
    "What the teacher looks for. Use it to know what to look for in the work. Where it and the band descriptors disagree about a level, the band descriptors decide.",
  exemplar:
    "One example of work at the standard it is labelled with. It shows a standard, not the only route to it: a student who reaches the same quality by another method meets it just as well. Never credit a student with something that is in the exemplar but not in their own work, and never compare their work to the exemplar in the evidence.",
  solution:
    "The teacher's reference solution. For criteria B, C and D it is a reference, not a rigid key: a different valid path is just as good.",
  other: "Background the teacher gave the students or wrote for the marking. Context only.",
};

/**
 * The task documents as one block for the grading prompts, or "" when there are
 * none — an assessment set up before task documents existed grades exactly as before.
 */
export function renderTaskDocumentsForGrading(docs: TaskDocumentRow[]): string {
  const usable = docs.filter((d) => d.text.trim() !== "");
  if (usable.length === 0) return "";
  const blocks = usable.map((d) => {
    const text = d.text.trim();
    const clipped =
      text.length > MAX_DOC_CHARS_FOR_GRADING
        ? `${text.slice(0, MAX_DOC_CHARS_FOR_GRADING)}\n[… the rest of this document is not included]`
        : text;
    return `=== ${TASK_DOCUMENT_LABELS[d.kind].toUpperCase()}: ${d.original_name} ===
How to read it: ${KIND_GUIDANCE[d.kind]}
${clipped}
=== END OF ${TASK_DOCUMENT_LABELS[d.kind].toUpperCase()} ===`;
  });
  return `TASK DOCUMENTS — the documents that define this task. Each one says what it is and how to read it.

${blocks.join("\n\n")}`;
}

/** The task documents block for one assessment's grading prompts. */
export function taskDocumentsForGrading(assessmentId: number): string {
  return renderTaskDocumentsForGrading(listTaskDocuments(assessmentId));
}

/**
 * Every achievement-level table printed across the task documents, one per
 * criterion. The same table is often printed twice — on the task sheet and again
 * on the feedback checklist — so the model is asked for each criterion once, and
 * a repeat that slips through is dropped here.
 */
export async function extractRubricsFromDocuments(docs: TaskDocumentRow[]): Promise<ProposedRubric[]> {
  const sources = docs.filter((d) => RUBRIC_SOURCE_KINDS.includes(d.kind) && d.text.trim() !== "");
  if (sources.length === 0) return [];
  const documents = sources
    .map(
      (d) =>
        `--- ${TASK_DOCUMENT_LABELS[d.kind]}: ${d.original_name} ---\n${d.text.trim().slice(0, MAX_DOC_CHARS_FOR_GRADING)}`
    )
    .join("\n\n");

  const parsed = await runClaudeJson<{ rubrics?: unknown }>({
    purpose: "task-document-rubrics",
    forbiddenNames: getForbiddenNames(),
    prompt: `You are reading the documents an MYP mathematics teacher set for one task. Find every
achievement-level table in them: a table of levels 1-2 / 3-4 / 5-6 / 7-8 against what the student
has to do. The same table is often printed in more than one document — return each criterion's
table ONCE.

${documents}

For each table, ${RUBRIC_SPLIT_RULES}

Also give each table its "criterion": the letter the table, or the document it is printed in, names
("Criterion D", "Task D", "Criteria C/D"). The MYP criterion names count as well: Knowing and
understanding = "A", Investigating patterns = "B", Communicating = "C", Applying mathematics in
real-life contexts = "D". Use null only when nothing says. If the documents print no such table,
return an empty list — do NOT invent descriptors.

Return ONLY strict JSON, no prose, no code fences:
{ "rubrics": [ { "criterion": "<A|B|C|D|null>",
                 "descriptors": [ { "band": "<1-2|3-4|5-6|7-8>", "strand": "<string|null>", "text": "<string>", "studentText": "<string|null>" } ] } ] }`,
  });

  const rubrics: ProposedRubric[] = [];
  for (const raw of Array.isArray(parsed.rubrics) ? parsed.rubrics : []) {
    // Criterion A is marked on points, never descriptors: its table is not one to keep,
    // and must not fall through to "no criterion named" and land on B or D instead.
    if (String((raw as { criterion?: unknown })?.criterion ?? "").trim().toUpperCase() === "A") continue;
    const rubric = coerceRubric(raw);
    if (!rubric) continue;
    if (rubric.criterion && rubrics.some((r) => r.criterion === rubric.criterion)) continue;
    rubrics.push(rubric);
  }
  return rubrics;
}
