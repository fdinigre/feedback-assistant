import "server-only";

import fs from "node:fs";
import path from "node:path";
import * as mupdf from "mupdf";
import { runClaudeJson } from "@/lib/pipeline/run";
import { scrubOutput } from "@/lib/pipeline/guards";
import { rasterizePdf } from "@/lib/pdf";
import { redactNamesInPdf } from "@/lib/ia/pdf-text";
import { iaPagesDir } from "@/lib/ia/paths";
import type { IaDocumentRow, IaMathCheck, IaMathFinding } from "@/lib/types";

/** Beyond this the pages are not sent as images (the IB asks for 12-20 pages). */
const MAX_PAGES = 30;

const KINDS = ["calculation", "method", "notation", "reasoning", "accuracy", "other"] as const;

/**
 * Makes the page images the math check reads: every roster name of the class is
 * redacted from the PDF itself (text removed, black box drawn), the redacted
 * text is read back and checked for names, and only then are the pages
 * rendered, under neutral file names. Returns [] when images can't be used
 * (not a PDF, too long, no text layer) — the check then runs on text alone.
 *
 * Limit: names inside pictures (a photo, a scanned signature) are pixels, not
 * text, and are not redacted.
 */
export async function preparePageImages(
  explorationId: number,
  doc: IaDocumentRow,
  forbiddenNames: string[]
): Promise<string[]> {
  const filePath = doc.file_path;
  if (!filePath || path.extname(filePath).toLowerCase() !== ".pdf" || !fs.existsSync(filePath)) return [];
  const dir = iaPagesDir(explorationId, doc.id);
  const existing = fs
    .readdirSync(dir)
    .filter((f) => /^page-\d+\.png$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  if (existing.length > 0) return existing.map((f) => path.join(dir, f));

  const original = fs.readFileSync(filePath);
  const { bytes } = redactNamesInPdf(original, forbiddenNames);
  const redacted = mupdf.Document.openDocument(bytes, "application/pdf");
  const pageCount = redacted.countPages();
  if (pageCount > MAX_PAGES) return [];

  let text = "";
  for (let i = 0; i < pageCount; i++) text += redacted.loadPage(i).toStructuredText().asText() + "\n";
  if (!text.trim()) return []; // a scan with no text layer: nothing could be redacted, so no images
  if (scrubOutput(text, forbiddenNames).warnings.length > 0) {
    throw new Error("A name was still found after redacting the draft — page images were not sent.");
  }

  const redactedPath = path.join(dir, "redacted.pdf");
  fs.writeFileSync(redactedPath, bytes);
  return rasterizePdf(redactedPath, dir);
}

function buildPrompt(pseudonym: string, draftText: string, pageCount: number): string {
  const pages =
    pageCount > 0
      ? `The ${pageCount} page images that follow are the same draft as rendered pages (names blacked
out). Use them to read equations, tables and graphs that the text layer garbles; quote from the TEXT.`
      : `Only the text layer is available; equations, tables and graphs may be garbled or missing.
Do not report a problem that may just be a text-extraction artefact.`;
  return `You are checking the MATHEMATICS of a draft IB Diploma Mathematics: Applications and
Interpretation SL Internal Assessment (Mathematical Exploration). Author pseudonym: ${pseudonym}; refer to
the author only as {{NAME}}. ${pages}

Work through the exploration step by step and RECOMPUTE everything you can: arithmetic, algebra,
derivatives and integrals, statistics (means, standard deviations, correlation, regression, chi-squared,
p-values) when the data are given, values read from tables and graphs, units, rounding and stated
accuracy, and whether each conclusion follows from the working. Also note notation that is wrong
(not just unusual), and claims that need justification but have none. Do the arithmetic carefully
and double-check a result before you call it wrong; when you cannot be sure, put it in "uncheckable"
instead of "findings". Do not report English, style or layout.

For each problem return:
- quote: a SHORT verbatim quote from the draft text that pins down where the problem is
- location: the page (e.g. "p. 4") or section
- kind: one of ${KINDS.join(", ")}
- severity: "major" (changes a result or conclusion) or "minor" (does not)
- teacherNote: for the TEACHER only — what is wrong, and the correct value or working
- studentNote: may be shown to the STUDENT. The IB allows the teacher to point out that an error
  exists but NOT to correct it: say where and what kind of problem it is so the student can find
  and fix it — e.g. "Check this calculation of the mean.", "Check the sign in this step.", "This value
  does not match Table 2." NEVER give the correct value, the corrected working, the right formula,
  or how to fix it.

Also return:
- checkedSummary: 1-3 sentences for the teacher on what you checked and found correct
- uncheckable: what you could not verify, and why (e.g. "the raw data for Table 3 is not given")

DRAFT TEXT (pseudonymized):
${draftText}

Return ONLY strict JSON:
{ "findings": [{ "quote": "...", "location": "...", "kind": "calculation", "severity": "major",
  "teacherNote": "...", "studentNote": "..." }], "checkedSummary": "...", "uncheckable": ["..."] }
No prose, no code fences.`;
}

export async function runMathCheck(args: {
  explorationId: number;
  doc: IaDocumentRow;
  pseudonym: string;
  forbiddenNames: string[];
}): Promise<IaMathCheck> {
  const { explorationId, doc, pseudonym, forbiddenNames } = args;
  const images = await preparePageImages(explorationId, doc, forbiddenNames);
  const raw = await runClaudeJson<Partial<IaMathCheck>>({
    purpose: "ia-math-check",
    forbiddenNames,
    prompt: buildPrompt(pseudonym, doc.text ?? "", images.length),
    imagePaths: images,
  });
  const clean = (s: unknown) => scrubOutput(String(s ?? ""), forbiddenNames).text;
  const findings: IaMathFinding[] = (Array.isArray(raw.findings) ? raw.findings : [])
    .map((f: Partial<IaMathFinding>) => ({
      quote: clean(f.quote),
      location: clean(f.location),
      kind: (KINDS as readonly string[]).includes(String(f.kind)) ? (f.kind as IaMathFinding["kind"]) : "other",
      severity: f.severity === "major" ? ("major" as const) : ("minor" as const),
      teacherNote: clean(f.teacherNote),
      studentNote: clean(f.studentNote),
    }))
    .filter((f) => f.teacherNote || f.studentNote);
  return {
    findings,
    checkedSummary: clean(raw.checkedSummary),
    uncheckable: (Array.isArray(raw.uncheckable) ? raw.uncheckable : []).map(clean).filter(Boolean),
    usedPageImages: images.length > 0,
  };
}

/** The findings as the draft-feedback prompt sees them, so criterion E reflects them. */
export function mathCheckPromptBlock(check: IaMathCheck | undefined): string {
  if (!check) return "";
  const lines = check.findings.map(
    (f, i) => `${i + 1}. [${f.severity}, ${f.kind}] ${f.location}: "${f.quote}" — ${f.teacherNote}`
  );
  return `\nMATHEMATICS CHECK (done separately, recomputing the working${check.usedPageImages ? " from the page images" : ""}):
${lines.length ? lines.join("\n") : "No problems found."}
Checked: ${check.checkedSummary}
${check.uncheckable.length ? `Could not verify: ${check.uncheckable.join("; ")}\n` : ""}Take these into account for B and E (correctness, accuracy, notation), judged against the rubric
and the IB guide notes — occasional minor errors do not stop the mathematics being "correct".\n`;
}
