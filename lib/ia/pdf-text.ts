// Character-level text of a typed IA PDF, used for two things done 100% locally:
//  - redacting a student's name from every page before any page image is made
//    for the AI (whole words only, the same rule lib/ia/extract.ts uses on text);
//  - finding where a quote the AI returned sits on the page, so it can be
//    highlighted in the annotated PDF.
//
// No "server-only" (like lib/pdf.ts): runs under the checks and standalone too.

import * as mupdf from "mupdf";

export type Quad = mupdf.Quad;
type CharEntry = { c: string; quad: Quad | null; line: number };

export type PageText = { page: number; chars: CharEntry[] };

/** Every character of every page with its quad; line breaks become "\n" with no quad. */
export function indexPdfText(doc: mupdf.Document): PageText[] {
  const pages: PageText[] = [];
  const n = doc.countPages();
  for (let i = 0; i < n; i++) {
    const chars: CharEntry[] = [];
    let line = 0;
    doc
      .loadPage(i)
      .toStructuredText("preserve-whitespace")
      .walk({
        onChar(c, _origin, _font, _size, quad) {
          chars.push({ c, quad: [...quad] as Quad, line });
        },
        endLine() {
          chars.push({ c: "\n", quad: null, line });
          line++;
        },
      });
    pages.push({ page: i + 1, chars });
  }
  return pages;
}

// ---------------------------------------------------------------------------
// Matching that survives the small differences between the PDF and the text the
// AI quoted from: case, runs of spaces and line breaks, curly vs straight quotes,
// dash variants, ligatures, and words hyphenated across a line break.
// ---------------------------------------------------------------------------

const FOLD: Record<string, string> = {
  "‘": "'", "’": "'", "‛": "'", "′": "'",
  "“": '"', "”": '"', "″": '"',
  "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "−": "-",
  " ": " ", "ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff",
};

function fold(c: string): string {
  const f = FOLD[c] ?? c;
  return f.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
}

/**
 * Normalized page string with a map back to char indexes. `spaces: false` drops
 * every space and line break, for quotes whose spacing differs from the PDF's.
 */
function normalize(chars: CharEntry[], spaces: boolean): { s: string; map: number[] } {
  let s = "";
  const map: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    const raw = chars[i].c;
    // "expo-\nnential" -> "exponential": a hyphen right before a line break joins the word.
    if ((raw === "-" || raw === "­") && chars[i + 1]?.c === "\n") {
      i++;
      continue;
    }
    if (/\s/.test(raw)) {
      if (!spaces) continue;
      if (s.endsWith(" ") || s === "") continue;
      s += " ";
      map.push(i);
      continue;
    }
    for (const f of fold(raw)) {
      s += f;
      map.push(i);
    }
  }
  return { s, map };
}

function normalizeQuote(q: string, spaces: boolean): string {
  let out = "";
  for (const ch of q.replace(/-\s*\n\s*/g, "")) {
    if (/\s/.test(ch)) {
      if (spaces && out && !out.endsWith(" ")) out += " ";
      continue;
    }
    out += fold(ch);
  }
  return out.trim();
}

/** One quad per line, spanning the matched chars on that line. */
function lineQuads(chars: CharEntry[], from: number, to: number): Quad[] {
  const byLine = new Map<number, Quad[]>();
  for (let i = from; i <= to; i++) {
    const e = chars[i];
    if (!e.quad || /\s/.test(e.c)) continue;
    const list = byLine.get(e.line) ?? [];
    list.push(e.quad);
    byLine.set(e.line, list);
  }
  const out: Quad[] = [];
  for (const qs of byLine.values()) {
    const first = qs[0];
    const last = qs[qs.length - 1];
    // ul, ur, ll, lr
    out.push([first[0], first[1], last[2], last[3], first[4], first[5], last[6], last[7]]);
  }
  return out;
}

export type QuoteHit = { page: number; quads: Quad[]; exact: boolean };

/** Parses "p. 3", "page 3", "pp. 3-4", "3" out of a location hint. */
export function pageHint(location: string | undefined): number | null {
  if (!location) return null;
  const m = /(?:\bpp?\.?|\bpages?)\s*(\d{1,3})/i.exec(location) ?? /^\s*(\d{1,3})\s*$/.exec(location);
  return m ? Number(m[1]) : null;
}

function findIn(pt: PageText, quote: string): { from: number; to: number } | null {
  for (const spaces of [true, false]) {
    const q = normalizeQuote(quote, spaces);
    if (q.length < 4) continue;
    const { s, map } = normalize(pt.chars, spaces);
    const at = s.indexOf(q);
    if (at >= 0) return { from: map[at], to: map[at + q.length - 1] };
  }
  return null;
}

/**
 * Finds a quote on the pages, trying the hinted page first. If the whole quote
 * isn't found (the AI trimmed or re-spaced it, or part of it is an equation the
 * text layer renders differently), falls back to its first or last several words
 * and reports `exact: false`. Null when nothing can be found.
 */
export function locateQuote(pages: PageText[], quote: string, location?: string): QuoteHit | null {
  const clean = quote.replace(/^[\s"'“”‘’.…]+|[\s"'“”‘’.…]+$/g, "").replace(/\s*(\.\.\.|…)\s*/g, " … ");
  if (clean.replace(/\s/g, "").length < 4) return null;
  const hint = pageHint(location);
  const order = hint && hint >= 1 && hint <= pages.length
    ? [pages[hint - 1], ...pages.filter((p) => p.page !== hint)]
    : pages;

  // An elided quote ("starts … ends"): look for its longest piece.
  const pieces = clean.split(" … ").map((p) => p.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  const whole = pieces[0];

  for (const pt of order) {
    const r = findIn(pt, whole);
    if (r) return { page: pt.page, quads: lineQuads(pt.chars, r.from, r.to), exact: pieces.length === 1 };
  }
  const words = whole.split(/\s+/);
  if (words.length >= 6) {
    const k = Math.min(8, Math.max(4, Math.floor(words.length / 2)));
    for (const part of [words.slice(0, k).join(" "), words.slice(-k).join(" ")]) {
      for (const pt of order) {
        const r = findIn(pt, part);
        if (r) return { page: pt.page, quads: lineQuads(pt.chars, r.from, r.to), exact: false };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Name redaction
// ---------------------------------------------------------------------------

function escapeRegExp(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Removes every whole-word occurrence of each name variant from the PDF: the text
 * is deleted from the page and a black box drawn in its place. Returns the
 * redacted PDF and the number of occurrences removed.
 */
export function redactNamesInPdf(bytes: Uint8Array, variants: string[]): { bytes: Buffer; hits: number } {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf").asPDF();
  if (!doc) throw new Error("redactNamesInPdf: not a PDF");
  const pages = indexPdfText(doc);
  let hits = 0;
  const longestFirst = [...variants].filter((v) => v.trim().length >= 2).sort((a, b) => b.length - a.length);
  for (const pt of pages) {
    const { s, map } = normalize(pt.chars, true);
    const taken = new Array<boolean>(s.length).fill(false);
    const quads: Quad[] = [];
    for (const v of longestFirst) {
      const needle = normalizeQuote(v, true);
      if (!needle) continue;
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(needle)}(?![\\p{L}\\p{N}])`, "gu");
      for (const m of s.matchAll(re)) {
        const a = m.index ?? 0;
        const b = a + needle.length - 1;
        if (taken.slice(a, b + 1).some(Boolean)) continue;
        for (let k = a; k <= b; k++) taken[k] = true;
        quads.push(...lineQuads(pt.chars, map[a], map[b]));
        hits++;
      }
    }
    if (quads.length === 0) continue;
    const page = doc.loadPage(pt.page - 1) as mupdf.PDFPage;
    for (const q of quads) {
      const annot = page.createAnnotation("Redact");
      annot.setQuadPoints([q]);
    }
    page.applyRedactions(true);
  }
  return { bytes: Buffer.from(doc.saveToBuffer("garbage,compress").asUint8Array()), hits };
}
