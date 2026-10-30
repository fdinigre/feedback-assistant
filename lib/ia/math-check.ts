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
const MAX_PAGES = 40;
/** Pages checked per AI call. A whole 20-page draft in one call can run past the 10-minute limit. */
const PAGES_PER_CHUNK = 6;
/** Chunks of one draft checked at the same time. */
const CHUNKS_AT_ONCE = 2;

const KINDS = ["calculation", "method", "notation", "reasoning", "accuracy", "other"] as const;

type Prepared = { images: string[]; pageTexts: string[] };

function pageTextsOf(doc: mupdf.Document): string[] {
  const out: string[] = [];
  for (let i = 0; i < doc.countPages(); i++) out.push(doc.loadPage(i).toStructuredText().asText());
  return out;
}

/**
 * Makes what the math check reads: every roster name of the class is redacted from
 * the PDF itself (text removed, black box drawn), the redacted text is read back and
 * checked for names, and only then are the pages rendered, under neutral file names.
 * Returns the page images and each page's (redacted) text. `images` is empty when
 * they can't be used (not a PDF, too long, no text layer) — the check then runs on
 * the stored pseudonymized text alone.
 *
 * Limit: names inside pictures (a photo, a scanned signature) are pixels, not text,
 * and are not redacted.
 */
export async function preparePages(
  explorationId: number,
  doc: IaDocumentRow,
  forbiddenNames: string[]
): Promise<Prepared> {
  const none: Prepared = { images: [], pageTexts: [] };
  const filePath = doc.file_path;
  if (!filePath || path.extname(filePath).toLowerCase() !== ".pdf" || !fs.existsSync(filePath)) return none;
  const dir = iaPagesDir(explorationId, doc.id);
  const redactedPath = path.join(dir, "redacted.pdf");
  const byNumber = (a: string, b: string) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]);
  const existing = fs.readdirSync(dir).filter((f) => /^page-\d+\.png$/.test(f)).sort(byNumber);

  let redacted: mupdf.Document;
  if (existing.length > 0 && fs.existsSync(redactedPath)) {
    redacted = mupdf.Document.openDocument(fs.readFileSync(redactedPath), "application/pdf");
  } else {
    const { bytes } = redactNamesInPdf(fs.readFileSync(filePath), forbiddenNames);
    redacted = mupdf.Document.openDocument(bytes, "application/pdf");
    if (redacted.countPages() > MAX_PAGES) return none;
    const texts = pageTextsOf(redacted);
    if (!texts.join("").trim()) return none; // a scan with no text layer: nothing could be redacted, so no images
    if (scrubOutput(texts.join("\n"), forbiddenNames).warnings.length > 0) {
      throw new Error("A name was still found after redacting the draft — page images were not sent.");
    }
    fs.writeFileSync(redactedPath, bytes);
    await rasterizePdf(redactedPath, dir);
  }
  const pageTexts = pageTextsOf(redacted);
  // Checked again on every run: the class list may have changed since the images were made.
  if (scrubOutput(pageTexts.join("\n"), forbiddenNames).warnings.length > 0) {
    throw new Error("A name was found in the redacted draft — page images were not sent. Re-upload the draft.");
  }
  const images = fs.readdirSync(dir).filter((f) => /^page-\d+\.png$/.test(f)).sort(byNumber).map((f) => path.join(dir, f));
  return { images, pageTexts };
}

function buildPrompt(args: {
  pseudonym: string;
  text: string;
  pages: { from: number; to: number; total: number } | null;
}): string {
  const { pseudonym, text, pages } = args;
  const scope = pages
    ? `The draft has ${pages.total} pages; its full text follows, marked page by page, so you can
follow definitions and results from anywhere in it. CHECK ONLY PAGES ${pages.from} TO ${pages.to}: the page
images that follow are those pages (names blacked out). Use them to read equations, tables and graphs
that the text layer garbles; quote from the TEXT. Report nothing on other pages.`
    : `Only the text layer is available; equations, tables and graphs may be garbled or missing.
Do not report a problem that may just be a text-extraction artefact.`;
  return `You are checking the MATHEMATICS of a draft IB Diploma Mathematics: Applications and
Interpretation SL Internal Assessment (Mathematical Exploration). Author pseudonym: ${pseudonym}; refer to
the author only as {{NAME}}. ${scope}

Work through the working step by step and RECOMPUTE everything you can: arithmetic, algebra,
derivatives and integrals, statistics (means, standard deviations, correlation, regression, chi-squared,
p-values) when the data are given, values read from tables and graphs, units, rounding and stated
accuracy, and whether each conclusion follows from the working. Also note notation that is wrong
(not just unusual), and claims that need justification but have none. Do the arithmetic carefully
and double-check a result before you call it wrong; when you cannot be sure, put it in "uncheckable"
instead of "findings". Do not report English, style or layout.

For each problem return:
- quote: a SHORT verbatim quote from the draft text that pins down where the problem is
- location: the page (e.g. "p. 4")
- kind: one of ${KINDS.join(", ")}
- severity: "major" (changes a result or conclusion) or "minor" (does not)
- teacherNote: for the TEACHER only — what is wrong, and the correct value or working
- studentNote: may be shown to the STUDENT. The IB allows the teacher to point out that an error
  exists but NOT to correct it: say where and what kind of problem it is so the student can find
  and fix it — e.g. "Check this calculation of the mean.", "Check the sign in this step.", "This value
  does not match Table 2." NEVER give the correct value, the corrected working, the right formula,
  or how to fix it.

Also return:
- checkedSummary: 1-2 sentences for the teacher on what you checked and found correct
- uncheckable: what you could not verify, and why (e.g. "the raw data for Table 3 is not given")

DRAFT TEXT${pages ? "" : " (pseudonymized)"}:
${text}

Return ONLY strict JSON:
{ "findings": [{ "quote": "...", "location": "...", "kind": "calculation", "severity": "major",
  "teacherNote": "...", "studentNote": "..." }], "checkedSummary": "...", "uncheckable": ["..."] }
No prose, no code fences.`;
}

type ChunkResult = { findings: IaMathFinding[]; checkedSummary: string; uncheckable: string[] };

async function runOne(prompt: string, images: string[], forbiddenNames: string[]): Promise<ChunkResult> {
  const raw = await runClaudeJson<Partial<IaMathCheck>>({
    purpose: "ia-math-check",
    forbiddenNames,
    prompt,
    imagePaths: images,
  });
  const clean = (s: unknown) => scrubOutput(String(s ?? ""), forbiddenNames).text;
  return {
    findings: (Array.isArray(raw.findings) ? raw.findings : [])
      .map((f: Partial<IaMathFinding>) => ({
        quote: clean(f.quote),
        location: clean(f.location),
        kind: (KINDS as readonly string[]).includes(String(f.kind)) ? (f.kind as IaMathFinding["kind"]) : "other",
        severity: f.severity === "major" ? ("major" as const) : ("minor" as const),
        teacherNote: clean(f.teacherNote),
        studentNote: clean(f.studentNote),
      }))
      .filter((f) => f.teacherNote || f.studentNote),
    checkedSummary: clean(raw.checkedSummary),
    uncheckable: (Array.isArray(raw.uncheckable) ? raw.uncheckable : []).map(clean).filter(Boolean),
  };
}

/** Page ranges of at most `size` pages, the last one taking what is left. */
export function chunkPages(total: number, size: number): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (let from = 1; from <= total; from += size) out.push({ from, to: Math.min(total, from + size - 1) });
  // A last chunk of one or two pages joins the one before it.
  if (out.length > 1 && out[out.length - 1].to - out[out.length - 1].from < 2) {
    const last = out.pop()!;
    out[out.length - 1].to = last.to;
  }
  return out;
}

/** Joins the chunks' results; a chunk that failed is reported, not fatal, unless all of them failed. */
export function mergeChunks(
  results: ({ range: { from: number; to: number } } & ({ ok: true; value: ChunkResult } | { ok: false; error: string }))[]
): ChunkResult {
  const ok = results.filter((r): r is { range: { from: number; to: number }; ok: true; value: ChunkResult } => r.ok);
  if (ok.length === 0) {
    const first = results.find((r) => !r.ok) as { ok: false; error: string } | undefined;
    throw new Error(first?.error ?? "The math check failed.");
  }
  const seen = new Set<string>();
  const findings: IaMathFinding[] = [];
  for (const r of ok)
    for (const f of r.value.findings) {
      const key = `${f.quote.trim().toLowerCase()}|${f.teacherNote.trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push(f);
    }
  const label = (r: { from: number; to: number }) => (r.from === r.to ? `p. ${r.from}` : `pp. ${r.from}-${r.to}`);
  const many = results.length > 1;
  const uncheckable = [
    ...results
      .filter((r) => !r.ok)
      .map((r) => `${label(r.range)} were not checked: ${(r as { error: string }).error}. Run the math check again to retry.`),
    ...new Set(ok.flatMap((r) => r.value.uncheckable)),
  ];
  return {
    findings,
    checkedSummary: ok
      .map((r) => (many ? `${label(r.range)}: ${r.value.checkedSummary}` : r.value.checkedSummary))
      .filter((s) => s.trim())
      .join(" "),
    uncheckable,
  };
}

export async function runMathCheck(args: {
  explorationId: number;
  doc: IaDocumentRow;
  pseudonym: string;
  forbiddenNames: string[];
}): Promise<IaMathCheck> {
  const { explorationId, doc, pseudonym, forbiddenNames } = args;
  const { images, pageTexts } = await preparePages(explorationId, doc, forbiddenNames);
  let merged: ChunkResult;

  if (images.length === 0) {
    merged = await runOne(buildPrompt({ pseudonym, text: doc.text ?? "", pages: null }), [], forbiddenNames);
  } else {
    const total = images.length;
    const marked = pageTexts.map((t, i) => `=== Page ${i + 1} ===\n${t.trim()}`).join("\n\n");
    const chunks = chunkPages(total, PAGES_PER_CHUNK);
    const results: Parameters<typeof mergeChunks>[0] = [];
    let next = 0;
    async function worker() {
      while (next < chunks.length) {
        const range = chunks[next++];
        try {
          const value = await runOne(
            buildPrompt({ pseudonym, text: marked, pages: { ...range, total } }),
            images.slice(range.from - 1, range.to),
            forbiddenNames
          );
          results.push({ range, ok: true, value });
        } catch (err) {
          results.push({ range, ok: false, error: (err as Error).message });
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CHUNKS_AT_ONCE, chunks.length) }, worker));
    results.sort((a, b) => a.range.from - b.range.from);
    merged = mergeChunks(results);
  }

  return {
    ...merged,
    usedPageImages: images.length > 0,
    documentId: doc.id,
    checkedAt: new Date().toISOString(),
  };
}

/** The findings as the draft-feedback prompt sees them, so criterion E reflects them. */
export function mathCheckPromptBlock(check: IaMathCheck | undefined): string {
  if (!check) return "";
  const lines = check.findings
    .filter((f) => !f.dismissed)
    .map((f, i) => `${i + 1}. [${f.severity}, ${f.kind}] ${f.location}: "${f.quote}" — ${f.teacherNote}`);
  return `\nMATHEMATICS CHECK (done separately, recomputing the working${check.usedPageImages ? " from the page images" : ""}):
${lines.length ? lines.join("\n") : "No problems found."}
Checked: ${check.checkedSummary}
${check.uncheckable.length ? `Could not verify: ${check.uncheckable.join("; ")}\n` : ""}Take these into account for B and E (correctness, accuracy, notation), judged against the rubric
and the IB guide notes — occasional minor errors do not stop the mathematics being "correct".\n`;
}
