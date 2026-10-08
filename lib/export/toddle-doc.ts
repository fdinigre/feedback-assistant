import "server-only";

import {
  getDpResult,
  getReport,
  getStudent,
  listCriterionLevels,
  listSubmissions,
} from "@/lib/db/queries";
import { isFmTest } from "@/lib/assessment/course";
import { formatTestScore, testScore } from "@/lib/assessment/test-score";
import { firstNameOf, injectName } from "@/lib/render/names";
import type { AssessmentRow } from "@/lib/types";

/**
 * One document holding every student's Toddle comment and their criterion
 * levels, for a reporting session where the teacher works down the class in one
 * sitting.
 *
 * HTML rather than Markdown because the destination is a rich-text box in
 * Toddle: pasted Markdown arrives as literal asterisks and dashes, while this
 * keeps its paragraphs and bullets. It also opens in any browser and prints to
 * PDF without anything installed.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The comment is plain text in a known shape: a short intro, then headed
 * sections ("What went well:", "What to work on:", "Your next steps:") each
 * followed by bullets.
 *
 * Processed line by line rather than by blank-line block, because the heading
 * is what separates one section from the next and the model doesn't always
 * leave a blank line before it.
 */
const BULLET = /^[-•*]\s+/;
/** A short line ending in a colon — the section headings above, and nothing else. */
const HEADING = /^.{1,60}:$/;

/** The comment's shape: a paragraph of lines, a section heading, or a run of bullets. */
export type CommentBlock =
  | { kind: "paragraph"; lines: string[] }
  | { kind: "section"; text: string }
  | { kind: "bullets"; items: string[] };

export function parseComment(comment: string): CommentBlock[] {
  const out: CommentBlock[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    out.push({ kind: "paragraph", lines: paragraph });
    paragraph = [];
  };
  const flushBullets = () => {
    if (bullets.length === 0) return;
    out.push({ kind: "bullets", items: bullets });
    bullets = [];
  };
  const flush = () => {
    flushParagraph();
    flushBullets();
  };

  for (const raw of comment.trim().split("\n")) {
    const line = raw.trim();

    if (line === "") {
      flush();
      continue;
    }

    if (BULLET.test(line)) {
      flushParagraph();
      bullets.push(line.replace(BULLET, "").replace(/^\*\*|\*\*$/g, ""));
      continue;
    }

    // Strip any markdown bold the model added around a heading.
    const bare = line.replace(/^\*\*(.*)\*\*$/, "$1").trim();
    if (HEADING.test(bare)) {
      flush();
      out.push({ kind: "section", text: bare });
      continue;
    }

    flushBullets();
    paragraph.push(line);
  }

  flush();
  return out;
}

export function commentToHtml(comment: string): string {
  return parseComment(comment)
    .map((block) => {
      if (block.kind === "paragraph") return `<p>${block.lines.map(escapeHtml).join("<br>")}</p>`;
      if (block.kind === "section") return `<p class="section">${escapeHtml(block.text)}</p>`;
      // Written as literal "- " lines rather than a <ul>. Toddle's editor drops
      // real list markup on paste, leaving the text unbulleted; a dash is plain
      // text and survives.
      return `<p class="bullets">${block.items.map((b) => `- ${escapeHtml(b)}`).join("<br>")}</p>`;
    })
    .join("\n");
}

export type ToddleDocResult = {
  html: string;
  studentCount: number;
  missing: string[];
};

export type ToddleEntry = {
  name: string;
  /** The comment with the student's name put back in. */
  comment: string;
  /** Levels, DP grade or score, as HTML; empty when there is none. */
  gradeLine: string;
};

/**
 * Every student with a Toddle comment, by first name, and who has none yet.
 * Shared by the one-page HTML document and the page-per-student Word file.
 */
export function collectToddleComments(assessment: AssessmentRow): { entries: ToddleEntry[]; missing: string[] } {
  // By first name, which is the order the teacher reads a class list in — and the
  // order she works down when pasting comments into Toddle one student at a time.
  const submissions = listSubmissions(assessment.id)
    .filter((s) => s.status !== "absent")
    .map((submission) => ({
      submission,
      student: submission.student_id ? getStudent(submission.student_id) : undefined,
    }))
    .sort((a, b) => {
      const aName = a.student?.name ?? "";
      const bName = b.student?.name ?? "";
      // An unassigned scan has no name to sort by, so it goes last rather than first.
      if (!aName || !bName) return aName ? -1 : bName ? 1 : 0;
      return (
        firstNameOf(aName).localeCompare(firstNameOf(bName)) || aName.localeCompare(bName)
      );
    });
  const isDp = assessment.programme === "DP";

  const entries: ToddleEntry[] = [];
  const missing: string[] = [];

  for (const { submission, student } of submissions) {
    const name = student?.name ?? `Unassigned (submission ${submission.id})`;

    const report = getReport(submission.id);
    const comment = report?.sections.toddleReport?.trim();
    if (!report || !comment) {
      missing.push(name);
      continue;
    }

    // Generated text refers to the student by pseudonym; the real name goes
    // back in here, on this machine, at render time. The student reads this one
    // themselves, so it uses their first name only — passing the first name as
    // the full name makes every {{NAME}}, {{FIRSTNAME}} and pseudonym resolve
    // to it.
    const withName = student
      ? injectName(comment, student.name, student.pseudonym)
      : comment;

    let gradeLine = "";
    if (isDp) {
      const result = getDpResult(submission.id);
      if (result) {
        gradeLine = `Grade ${result.grade_final ?? result.grade} (${result.pct.toFixed(0)}%)`;
      }
    } else if (isFmTest(assessment)) {
      const score = testScore(assessment, submission);
      if (score) gradeLine = `Score ${formatTestScore(score)}`;
    } else {
      const levels = listCriterionLevels(submission.id);
      if (levels.length > 0) {
        gradeLine = levels
          .slice()
          .sort((a, b) => a.criterion.localeCompare(b.criterion))
          .map((l) => `${l.criterion}: ${l.level_final ?? l.level_conservative}`)
          .join(" &nbsp;·&nbsp; ");
      }
    }

    entries.push({ name, comment: withName, gradeLine });
  }

  return { entries, missing };
}

export function buildToddleDocument(assessment: AssessmentRow): ToddleDocResult {
  const isDp = assessment.programme === "DP";
  const { entries, missing } = collectToddleComments(assessment);
  const studentCount = entries.length;
  const sections = entries.map(
    ({ name, comment, gradeLine }) => `
    <section class="student">
      <div class="head">
        <h2>${escapeHtml(name)}</h2>
        ${gradeLine ? `<p class="levels">${gradeLine}</p>` : ""}
        <button class="copy" type="button">Copy comment</button>
      </div>
      <div class="comment">${commentToHtml(comment)}</div>
    </section>`
  );

  const title = `${assessment.title} — Toddle comments`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0 auto; max-width: 820px; padding: 32px 20px 64px;
         font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
         color: #0f172a; background: #fff; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { color: #64748b; font-size: 13px; margin: 0 0 28px; }
  .student { border-top: 1px solid #e2e8f0; padding: 20px 0; }
  .head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  h2 { font-size: 17px; margin: 0; }
  .levels { margin: 0; color: #334155; font-size: 13px; font-weight: 600; }
  .copy { margin-left: auto; font: inherit; font-size: 12px; padding: 4px 10px;
          border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; cursor: pointer; }
  .copy:hover { background: #f1f5f9; }
  .comment { margin-top: 10px; }
  .comment p { margin: 0 0 10px; }
  .comment .bullets { margin: 0 0 6px; }
  /* Section headings ("What to work on:") carry the gap between sections. */
  .comment .section { margin: 22px 0 6px; font-weight: 600; }
  .comment > :first-child.section { margin-top: 0; }
  .missing { margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px;
             color: #92400e; font-size: 13px; }
  @media print {
    .copy { display: none; }
    .student { break-inside: avoid; }
  }
</style>
</head>
<body>
<h1>${escapeHtml(assessment.title)}</h1>
<p class="meta">
  Toddle comments and ${isDp ? "grades" : "criterion levels"} ·
  ${studentCount} student${studentCount === 1 ? "" : "s"}${
    assessment.date ? ` · ${escapeHtml(assessment.date)}` : ""
  }
</p>
${sections.join("\n")}
${
  missing.length > 0
    ? `<p class="missing">No Toddle comment yet for: ${missing.map(escapeHtml).join(", ")}. Generate their reports first.</p>`
    : ""
}
<script>
// Copies one student's comment as rich text, so it keeps its bullets when
// pasted into Toddle. execCommand is deprecated but is the only thing that
// reliably carries formatting from a page opened off the local disk.
document.querySelectorAll(".copy").forEach(function (button) {
  button.addEventListener("click", function () {
    var comment = button.closest(".student").querySelector(".comment");
    var range = document.createRange();
    range.selectNodeContents(comment);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    selection.removeAllRanges();
    button.textContent = ok ? "Copied" : "Select and copy";
    if (!ok) { selection.addRange(range); }
    setTimeout(function () { button.textContent = "Copy comment"; }, 1800);
  });
});
</script>
</body>
</html>`;

  return { html, studentCount, missing };
}
