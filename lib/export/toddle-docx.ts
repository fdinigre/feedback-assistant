import "server-only";

import { collectToddleComments, parseComment } from "@/lib/export/toddle-doc";
import { createZip } from "@/lib/export/zip";
import type { AssessmentRow } from "@/lib/types";

/**
 * Every student's Toddle comment as a Word document, one student to a page and
 * no grade on it: something to print and hand back, or to work through a page
 * at a time.
 *
 * Written by hand rather than with a library — a .docx is a ZIP of a few XML
 * parts, the app already has a ZIP writer, and a new dependency would mean an
 * `npm install` on every Mac that syncs the code.
 */

function xml(text: string): string {
  return text
    // Control characters are not allowed in XML at all, and one would make Word refuse the file.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function run(text: string, { bold = false, size }: { bold?: boolean; size?: number } = {}): string {
  const props = `${bold ? "<w:b/>" : ""}${size ? `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` : ""}`;
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
}

function paragraph(runs: string, { spaceBefore = 0, spaceAfter = 120 } = {}): string {
  return `<w:p><w:pPr><w:spacing w:before="${spaceBefore}" w:after="${spaceAfter}"/></w:pPr>${runs}</w:p>`;
}

/**
 * A page break as a character rather than a paragraph setting: Word honours
 * both, but Pages, Google Docs and the macOS preview only honour this one.
 */
const PAGE_BREAK = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

/** One student's page: their name, then the comment in the shape Toddle expects. */
function studentPage(name: string, comment: string, first: boolean): string {
  const parts = [...(first ? [] : [PAGE_BREAK]), paragraph(run(name, { bold: true, size: 32 }), { spaceAfter: 240 })];
  for (const block of parseComment(comment)) {
    if (block.kind === "paragraph") {
      parts.push(paragraph(block.lines.map((l) => run(l)).join("<w:r><w:br/></w:r>")));
    } else if (block.kind === "section") {
      parts.push(paragraph(run(block.text, { bold: true }), { spaceBefore: 240, spaceAfter: 80 }));
    } else {
      // "- " lines, as on the HTML version: plain text that survives a paste into Toddle.
      for (const item of block.items) parts.push(paragraph(run(`- ${item}`), { spaceAfter: 60 }));
    }
  }
  return parts.join("");
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/** Only defaults: an 11pt sans body with a little room between lines. */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
</w:styles>`;

export function buildToddlePagesDocx(assessment: AssessmentRow): { buffer: Buffer; studentCount: number } {
  const { entries } = collectToddleComments(assessment);
  const body = entries.map((e, i) => studentPage(e.name, e.comment, i === 0)).join("");
  // A4 with 2.5 cm margins.
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body>
</w:document>`;

  const buffer = createZip([
    { name: "[Content_Types].xml", content: CONTENT_TYPES },
    { name: "_rels/.rels", content: ROOT_RELS },
    { name: "word/document.xml", content: document },
    { name: "word/_rels/document.xml.rels", content: DOCUMENT_RELS },
    { name: "word/styles.xml", content: STYLES },
  ]);
  return { buffer, studentCount: entries.length };
}
