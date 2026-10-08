// Local, deterministic text extraction for DP paper/markscheme uploads (PDF or .docx).
// No "server-only" import: this needs to run standalone via `npx tsx` for the manual
// verification script, the same reason lib/pdf.ts omits it.
import fs from "node:fs";
import path from "node:path";
import * as mupdf from "mupdf";
import mammoth from "mammoth";

/** Extracts text page-by-page from a PDF using mupdf's structured text extraction. */
export function extractPdfPageTexts(filePath: string): string[] {
  const doc = mupdf.Document.openDocument(filePath) as mupdf.PDFDocument;
  const pageCount = doc.countPages();
  const pages: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    const page = doc.loadPage(i);
    const text = page.toStructuredText("preserve-whitespace").asText();
    pages.push(text);
  }
  return pages;
}

/** Extracts raw text from a .docx file. No page concept — returned as a single "page". */
export async function extractDocxText(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/**
 * Extracts text from a PDF or .docx file, returned as an array of page texts
 * (PDF: one entry per page; .docx: a single entry with the whole document).
 */
export async function extractFileText(filePath: string): Promise<string[]> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") {
    return extractPdfPageTexts(filePath);
  }
  if (ext === ".docx") {
    const text = await extractDocxText(filePath);
    return [text];
  }
  throw new Error(`extractFileText: unsupported file extension "${ext}" for ${filePath}`);
}
