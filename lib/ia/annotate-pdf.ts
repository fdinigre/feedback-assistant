// Builds the annotated copy of a student's IA draft, 100% locally (mupdf):
// colour-coded highlights on the student's own PDF, a numbered marker in the
// margin beside each one, and summary pages appended at the END (so the paper's
// own page numbers, which the comments refer to, stay the same).
//
// Two versions:
//  - teacher: everything — levels, rubric item ids and statuses, the math
//    check's correct values, gaps and suggested fixes.
//  - student: highlights and comments only. No levels or marks, no rubric item
//    ids (they encode the band), and for mathematics only the note that points
//    at the problem — never the correction (IB: teachers indicate errors but
//    must not correct them, and must not edit the draft).
//
// Pure apart from mupdf (no DB, no "server-only"); the route gathers the data.

import * as mupdf from "mupdf";
import { indexPdfText, locateQuote, type PageText, type Quad } from "@/lib/ia/pdf-text";
import type { RubricCriterion } from "@/lib/ia/rubric-items";
import { CATEGORY_STYLE, type TargetCategory } from "@/lib/ia/feedback-targets";
import { feedbackMathState, MATH_STATE_TEXT } from "@/lib/ia/feedback-state";
import type { IaChecklistStatus, IaDraftFeedback } from "@/lib/types";

export type AnnotatedVersion = "teacher" | "student";
type Category = TargetCategory;

export { CATEGORY_STYLE };

const MAX_BY: Record<string, number> = { A: 4, B: 4, C: 3, D: 3, E: 6 };
const STATUS_WORD: Record<IaChecklistStatus, string> = { evident: "Evident", partly: "Partly", not_evident: "Not evident" };

/** One highlight and its note: a short heading (what kind of note) and the note itself. */
type Mark = { category: Category; quote: string; location: string; heading: string; comment: string };
export type PlacedComment = Mark & { n: number; page: number | null; approx: boolean };

/** A reason that slipped in a level or mark is kept off the student copy. */
const LEVEL_TALK = /\b(level|band|mark)s?\s*\d|\b\d\s*\/\s*(3|4|6|20)\b/i;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The marks each version shows, in reading order of the criteria. */
export function collectMarks(fb: IaDraftFeedback, rubric: RubricCriterion[], version: AnnotatedVersion): Mark[] {
  const teacher = version === "teacher";
  const marks: Mark[] = [];
  const itemText = new Map<string, string>();
  for (const c of rubric) for (const b of c.bands) for (const i of b.items) itemText.set(i.id, i.text);

  for (const c of fb.criteria) {
    const cat = c.criterion as Category;
    const max = MAX_BY[c.criterion] ?? 0;
    const name = CATEGORY_STYLE[cat].name;
    for (const e of c.evidence ?? []) {
      if (!e.quote?.trim()) continue;
      const why = e.why?.trim() ?? "";
      marks.push({
        category: cat,
        quote: e.quote,
        location: e.location,
        heading: teacher ? `${c.criterion} · ${name} · evidence for ${c.level}/${max}` : name,
        comment: teacher
          ? why || "No reason was recorded with this feedback — regenerate it to get one."
          : LEVEL_TALK.test(why) ? "" : why,
      });
    }
    for (const m of c.checklist ?? []) {
      const status = m.teacherStatus ?? m.status ?? "not_evident";
      if (status === "not_evident") continue;
      const text = itemText.get(m.id);
      if (!text) continue;
      const own = m.comment?.trim();
      if (!m.quote?.trim() && !own) continue; // nothing to point at and nothing said: summary only
      marks.push({
        category: cat,
        quote: m.quote ?? "",
        location: m.location ?? "",
        heading: teacher
          ? `${m.id} · ${STATUS_WORD[status]}${m.teacherStatus ? " (set by you)" : ""}`
          : `${name}${status === "partly" ? " · partly" : ""}`,
        comment: `${text}${
          m.why?.trim() && (teacher || !LEVEL_TALK.test(m.why)) ? ` — ${m.why.trim()}` : ""
        }${own ? ` ${teacher ? "Your comment" : "Teacher"}: ${own}` : ""}`,
      });
    }
  }
  for (const f of fb.mathCheck?.findings ?? []) {
    if (f.dismissed) continue;
    marks.push({
      category: "M",
      quote: f.quote,
      location: f.location,
      heading: teacher ? `Math · ${f.severity} · ${f.kind}` : "Check the mathematics",
      comment: teacher ? `${f.teacherNote} Student sees: “${f.studentNote}”` : f.studentNote,
    });
  }
  return marks.filter((m) => m.heading.trim() || m.comment.trim());
}

function marginMarker(page: mupdf.PDFPage, quad: Quad, n: number, rgb: [number, number, number]): void {
  const [, , pageW] = page.getBounds();
  const top = Math.min(quad[1], quad[3]);
  const annot = page.createAnnotation("FreeText");
  annot.setRect([pageW - 40, top - 1, pageW - 20, top + 11]);
  annot.setContents(String(n));
  annot.setDefaultAppearance("Helv", 8, [0, 0, 0]);
  annot.setColor(rgb); // for FreeText, the colour is the box background
  annot.setBorderWidth(0);
  annot.update();
}

/** The teacher copy's math section: what was checked (one line each) and what could not be. */
function mathSection(m: NonNullable<IaDraftFeedback["mathCheck"]>): string {
  const checked = m.checked ?? [];
  return (
    `<h2>Math check</h2>${m.checkedSummary && checked.length ? `<p>${esc(m.checkedSummary)}</p>` : ""}` +
    (checked.length
      ? `<p class="lab">Checked and found correct</p><ul>${checked.map((c) => `<li><b>${esc(c.location)}</b> — ${esc(c.what)}</li>`).join("")}</ul>`
      : m.checkedSummary
        ? m.checkedSummary.split(/\s(?=pp?\.\s*\d+(?:\s*-\s*\d+)?:)/).map((t) => `<p>${esc(t.trim())}</p>`).join("")
        : "") +
    (m.uncheckable.length ? `<p class="lab">Could not verify</p><ul>${m.uncheckable.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>` : "")
  );
}

function summaryHtml(args: {
  fb: IaDraftFeedback;
  version: AnnotatedVersion;
  studentName: string;
  comments: PlacedComment[];
  hadPdf: boolean;
}): string {
  const { fb, version, studentName, comments, hadPdf } = args;
  const teacher = version === "teacher";
  const swatch = (c: Category) =>
    `<span style="background:${CATEGORY_STYLE[c].hex};padding:0 6px;border:1px solid #888">&nbsp;</span>`;
  const parts: string[] = [];
  parts.push(`<h1>IA draft feedback${teacher ? " — teacher copy" : ""}</h1><p class="sub">${esc(studentName)}</p>`);
  const mathState = feedbackMathState(fb);
  if (teacher && mathState !== "ok") parts.push(`<p class="warn">${esc(MATH_STATE_TEXT[mathState])}</p>`);

  if (teacher && fb.criteria.length > 0) {
    const total = fb.criteria.reduce((s, c) => s + (c.level ?? 0), 0);
    parts.push(
      `<table><tr><th></th><th>Criterion</th><th>Level</th></tr>${fb.criteria
        .map((c) => `<tr><td>${swatch(c.criterion as Category)}</td><td>${c.criterion} · ${esc(CATEGORY_STYLE[c.criterion as Category].name)}</td><td>${c.level} / ${MAX_BY[c.criterion]}</td></tr>`)
        .join("")}<tr><td></td><td><b>Total</b></td><td><b>${total} / 20</b></td></tr></table>`
    );
    if (fb.summary?.trim()) parts.push(`<h2>Summary</h2><p>${esc(fb.summary)}</p>`);
    for (const c of fb.criteria) {
      const list = (label: string, xs: string[]) =>
        xs.filter((x) => x.trim()).length ? `<p class="lab">${label}</p><ul>${xs.filter((x) => x.trim()).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
      parts.push(
        `<div class="crit" style="border-color:${CATEGORY_STYLE[c.criterion as Category].hex}"><h3>${c.criterion} · ${esc(CATEGORY_STYLE[c.criterion as Category].name)} — ${c.level}/${MAX_BY[c.criterion]}</h3>${
          c.teacherComment?.trim() ? `<p><b>Your comment:</b> ${esc(c.teacherComment)}</p>` : ""
        }${list("Strengths", c.strengths)}${list("To reach the next band", c.gaps)}${list("Suggested fixes (not for the student)", c.suggestions)}</div>`
      );
    }
    if (fb.mathCheck) parts.push(mathSection(fb.mathCheck));
  } else if (teacher) {
    parts.push(`<p class="sub">Only the math check has run; the criteria come with the draft feedback.</p>`);
    if (fb.mathCheck) parts.push(mathSection(fb.mathCheck));
  } else {
    if (fb.toddleComment?.trim()) parts.push(`<h2>Overall</h2><p>${esc(fb.toddleComment)}</p>`);
    const withComment = fb.criteria.filter((c) => c.teacherComment?.trim());
    if (withComment.length) {
      parts.push(`<h2>Comments by criterion</h2>`);
      for (const c of withComment)
        parts.push(`<div class="crit" style="border-color:${CATEGORY_STYLE[c.criterion as Category].hex}"><h3>${esc(CATEGORY_STYLE[c.criterion as Category].name)}</h3><p>${esc(c.teacherComment ?? "")}</p></div>`);
    }
  }

  parts.push(
    `<h2>Colour key</h2><p>${(Object.keys(CATEGORY_STYLE) as Category[])
      .map((c) => `${swatch(c)} ${esc(CATEGORY_STYLE[c].name)}`)
      .join(" &nbsp; ")}</p>`
  );

  // One block per comment, its criterion's colour down the left edge. Plain blocks,
  // not a table: the PDF's HTML layout gets narrow table columns wrong.
  const block = (c: PlacedComment, withNumber: boolean) =>
    `<div class="cm" style="border-color:${CATEGORY_STYLE[c.category].hex}">` +
    `<p class="hd">${withNumber ? `<b>${c.n}</b> &nbsp;` : ""}${esc(c.heading)}${!withNumber && c.location ? ` <span class="sub">· ${esc(c.location)}</span>` : ""}</p>` +
    (c.comment.trim() ? `<p>${esc(c.comment)}</p>` : "") +
    (teacher && c.quote.trim() ? `<p class="q">“${esc(c.quote)}”${c.approx ? " (highlight placed on part of the quote)" : ""}</p>` : "") +
    (!teacher && !withNumber && c.quote.trim() ? `<p class="q">“${esc(c.quote)}”</p>` : "") +
    `</div>`;

  const placed = comments.filter((c) => c.page != null);
  const unplaced = comments.filter((c) => c.page == null);
  if (placed.length) {
    parts.push(`<h2>Comments on the pages</h2><p class="sub">Each number matches the marker in the margin beside a highlight.</p>`);
    const pageNums = [...new Set(placed.map((c) => c.page as number))].sort((a, b) => a - b);
    for (const pg of pageNums) {
      parts.push(`<h3 class="pg">Page ${pg}</h3>`);
      parts.push(placed.filter((c) => c.page === pg).sort((a, b) => a.n - b.n).map((c) => block(c, true)).join(""));
    }
  }
  if (unplaced.length) {
    parts.push(
      `<h2>${hadPdf ? "Comments that could not be placed on a page" : "Comments"}</h2>${
        hadPdf ? `<p class="sub">The quoted text could not be found in the PDF (for example, it sits inside an equation or a picture).</p>` : ""
      }${unplaced.map((c) => block(c, false)).join("")}`
    );
  }

  return `<html><head><style>
body{font-family:sans-serif;font-size:9.5pt;color:#1e293b}
h1{font-size:16pt;margin:0 0 2pt 0}h2{font-size:12pt;margin:12pt 0 4pt 0}h3{font-size:10.5pt;margin:0 0 3pt 0}
.sub{color:#64748b;font-size:8.5pt}.lab{font-weight:bold;margin:4pt 0 0 0}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #cbd5e1;padding:3pt;vertical-align:top;text-align:left}
.cm{border-left:5px solid #999;padding:2pt 0 2pt 7pt;margin:0 0 6pt 0}.cm p{margin:0 0 1pt 0}
.hd{font-weight:bold;font-size:9pt}.q{color:#475569;font-style:italic;font-size:8.5pt}
h3.pg{margin:9pt 0 4pt 0;color:#334155}
.warn{border-left:5px solid #d97706;padding:3pt 0 3pt 8pt;color:#92400e;margin:6pt 0}
.crit{border-left:5px solid #999;padding:3pt 0 3pt 8pt;margin:6pt 0}ul{margin:2pt 0 2pt 14pt;padding:0}
</style></head><body>${parts.join("\n")}</body></html>`;
}

function htmlToPdf(html: string, width: number, height: number): mupdf.PDFDocument {
  const doc = mupdf.Document.openDocument(Buffer.from(html, "utf-8"), "text/html");
  doc.layout(width - 2 * 48, height - 2 * 48, 10);
  const out = new mupdf.Buffer();
  const w = new mupdf.DocumentWriter(out, "pdf", "");
  for (let i = 0; i < doc.countPages(); i++) {
    const p = doc.loadPage(i);
    const dev = w.beginPage([0, 0, width, height]);
    p.run(dev, mupdf.Matrix.translate(48, 48));
    w.endPage();
  }
  w.close();
  return mupdf.Document.openDocument(out.asUint8Array(), "application/pdf").asPDF()!;
}

/**
 * The annotated copy. `pdfBytes` is the student's original PDF, or null for a Word
 * draft — then the result is the summary pages alone, every comment listed with its
 * location.
 */
export function buildAnnotatedPdf(args: {
  pdfBytes: Uint8Array | null;
  feedback: IaDraftFeedback;
  rubric: RubricCriterion[];
  version: AnnotatedVersion;
  studentName: string;
}): { bytes: Buffer; comments: PlacedComment[] } {
  const { pdfBytes, feedback, rubric, version, studentName } = args;
  const marks = collectMarks(feedback, rubric, version);
  const doc = pdfBytes ? mupdf.Document.openDocument(pdfBytes, "application/pdf").asPDF() : null;
  const pages: PageText[] = doc ? indexPdfText(doc) : [];
  const comments: PlacedComment[] = [];
  let n = 0;

  for (const m of marks) {
    const hit = doc && m.quote.trim() ? locateQuote(pages, m.quote, m.location) : null;
    if (!hit || !doc || hit.quads.length === 0) {
      comments.push({ ...m, n: 0, page: null, approx: false });
      continue;
    }
    n++;
    const page = doc.loadPage(hit.page - 1) as mupdf.PDFPage;
    const style = CATEGORY_STYLE[m.category];
    const annot = page.createAnnotation("Highlight");
    annot.setQuadPoints(hit.quads);
    annot.setColor(style.rgb);
    annot.setOpacity(m.category === "M" ? 0.45 : 0.4);
    annot.setContents(`${n}. ${m.heading}${m.comment.trim() ? ` — ${m.comment}` : ""}`);
    annot.setAuthor(version === "teacher" ? "Feedback Assistant (teacher copy)" : "Teacher feedback");
    annot.update();
    marginMarker(page, hit.quads[0], n, style.rgb);
    comments.push({ ...m, n, page: hit.page, approx: !hit.exact });
  }

  let w = 595;
  let h = 842;
  if (doc && doc.countPages() > 0) {
    const b = doc.loadPage(0).getBounds();
    w = b[2] - b[0];
    h = b[3] - b[1];
  }
  const summary = htmlToPdf(summaryHtml({ fb: feedback, version, studentName, comments, hadPdf: !!doc }), w, h);
  const target = doc ?? new mupdf.PDFDocument();
  for (let i = 0; i < summary.countPages(); i++) target.graftPage(-1, summary, i);
  return { bytes: Buffer.from(target.saveToBuffer("garbage,compress").asUint8Array()), comments };
}
