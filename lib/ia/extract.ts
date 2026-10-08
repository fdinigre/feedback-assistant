// Local text extraction + textual pseudonymization for IA (Mathematical
// Exploration) uploads.
//
// No "server-only" here (unlike lib/ia/feedback.ts, lib/ia/marking.ts) —
// mirrors lib/pdf.ts's rationale: this module holds no secrets/keys and needs
// to run standalone via `npx tsx scripts/test-ia-extract.mts`, outside Next's
// bundler, where the server-only guard throws unconditionally.

import path from "node:path";
import mammoth from "mammoth";
import * as mupdf from "mupdf";

const MIN_PART_LEN = 2;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Unicode-letter boundaries (not ASCII \b, which never matches non-Latin names).
// Defined locally rather than imported from lib/pipeline/guards so this module stays
// free of the server-only/DB imports that let it run standalone under tsx.
function nameRegex(name: string, flags = "gi"): RegExp {
  return new RegExp(`(?<!\\p{L})${escapeRegExp(name)}(?!\\p{L})`, `${flags}u`);
}

/**
 * Every searchable variant of a student's name: the full name, and each
 * individual token (first name, each surname — and since an "obvious
 * nickname" is simply the first token, that's covered too). Sorted
 * longest-first so a full-name match is consumed before any lone token
 * nested inside it gets a second, redundant replacement pass.
 */
export function nameVariants(fullName: string): string[] {
  const trimmed = fullName.trim();
  const tokens = trimmed
    .split(/\s+/)
    .map((t) => t.replace(/[,.]/g, ""))
    .filter(Boolean);
  const variants = new Set<string>();
  if (trimmed.length >= MIN_PART_LEN) variants.add(trimmed);
  for (const t of tokens) {
    if (t.length >= MIN_PART_LEN) variants.add(t);
  }
  return [...variants].sort((a, b) => b.length - a.length);
}

/**
 * Replaces every case-insensitive, whole-word occurrence of any variant of
 * `studentName` in `text` with `pseudonym`, across the ENTIRE string. A
 * repeated header/footer name is just more text at this point in the
 * pipeline — no special-casing "page 1 only" the way the PDF scan mask does.
 */
export function pseudonymizeText(
  text: string,
  studentName: string,
  pseudonym: string
): { text: string; replacements: number } {
  let out = text;
  let replacements = 0;
  for (const variant of nameVariants(studentName)) {
    // Unicode-letter boundaries (not ASCII \b) so non-Latin names — Arabic, CJK,
    // Cyrillic, accented Latin — are actually replaced.
    const pattern = nameRegex(variant, "gi");
    out = out.replace(pattern, () => {
      replacements++;
      return pseudonym;
    });
  }
  return { text: out, replacements };
}

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/** mupdf's openDocument accepts a Uint8Array directly — a Node Buffer qualifies, no temp file needed. */
export function extractPdfText(buffer: Buffer): string {
  const doc = mupdf.Document.openDocument(buffer, "application/pdf");
  const pageCount = doc.countPages();
  const parts: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    const page = doc.loadPage(i);
    parts.push(page.toStructuredText().asText());
  }
  return parts.join("\n\n");
}

export type ExtractedDocument = { text: string; replacements: number };

/**
 * Extracts text from a .docx or .pdf buffer 100% locally (mammoth / mupdf,
 * no network) and pseudonymizes the WHOLE document. This is the first line
 * of defense against a student name reaching a prompt — runClaude's
 * forbidden-name guard (lib/pipeline/run.ts) is the second, belt-and-braces.
 */
export async function extractAndPseudonymize(args: {
  buffer: Buffer;
  originalName: string;
  studentName: string;
  pseudonym: string;
}): Promise<ExtractedDocument> {
  const ext = path.extname(args.originalName).toLowerCase();
  let raw: string;
  if (ext === ".docx") {
    raw = await extractDocxText(args.buffer);
  } else if (ext === ".pdf") {
    raw = extractPdfText(args.buffer);
  } else {
    throw new Error(
      `extractAndPseudonymize: unsupported file type "${ext}" — upload a .docx or .pdf.`
    );
  }
  return pseudonymizeText(raw, args.studentName, args.pseudonym);
}
