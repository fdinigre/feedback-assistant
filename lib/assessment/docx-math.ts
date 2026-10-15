// Word equations as plain text, so a .docx read for its text keeps its maths.
// No "server-only" import, for the same reason as extract-text.ts: scripts run it.
//
// The Word reader (mammoth) skips equation-editor objects entirely. A worked
// solution or an exemplar typed with the equation editor — which is how the
// students are taught to write maths — came through with every equation gone:
// "so I let :" and then nothing. Each equation is rewritten here as an ordinary
// run of text before the reader sees the file: fractions as a/b, powers as x^2,
// subscripts as C_H, roots as sqrt(...).
import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

const M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

// xmldom's node types, kept to what is used here.
type XNode = {
  nodeType: number;
  namespaceURI: string | null;
  localName: string | null;
  textContent: string | null;
  childNodes: ArrayLike<XNode>;
  parentNode: XNode | null;
  getAttributeNS?: (ns: string, name: string) => string | null;
  getAttribute?: (name: string) => string | null;
};
const ELEMENT = 1;

function children(node: XNode, localName?: string): XNode[] {
  return Array.from(node.childNodes).filter(
    (c) => c.nodeType === ELEMENT && c.namespaceURI === M_NS && (!localName || c.localName === localName)
  );
}

function child(node: XNode, localName: string): XNode | undefined {
  return children(node, localName)[0];
}

/** The m:val of a property such as <m:begChr m:val="[">, or undefined when it is absent. */
function prop(node: XNode, propsName: string, name: string): string | undefined {
  const props = child(node, propsName);
  const el = props ? child(props, name) : undefined;
  if (!el) return undefined;
  return el.getAttributeNS?.(M_NS, "val") ?? el.getAttribute?.("m:val") ?? "";
}

/** Brackets a part that is more than one symbol, so 4050/80 stays 4050/80 but a + b over c reads (a + b)/c. */
function group(text: string): string {
  const t = text.trim();
  return /^[\p{L}\p{N}.,]*$/u.test(t) || isBracketed(t) ? t : `(${t})`;
}

/** Whether the whole of it is already one bracketed group: "(x-1)" yes, "(a)(b)" no. */
function isBracketed(t: string): boolean {
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const close = pairs[t[0]];
  if (!close || t[t.length - 1] !== close) return false;
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === t[0]) depth++;
    else if (t[i] === close) depth--;
    if (depth === 0 && i < t.length - 1) return false;
  }
  return true;
}

function inner(node: XNode | undefined): string {
  return node ? children(node).map(linear).join("") : "";
}

/** One OMML element as a line of plain text. */
export function linear(node: XNode): string {
  switch (node.localName) {
    case "r":
      return children(node, "t").map((t) => t.textContent ?? "").join("");
    case "t":
      return node.textContent ?? "";
    case "f":
      return `${group(inner(child(node, "num")))}/${group(inner(child(node, "den")))}`;
    case "sSup":
      return `${group(inner(child(node, "e")))}^${group(inner(child(node, "sup")))}`;
    case "sSub":
      return `${group(inner(child(node, "e")))}_${group(inner(child(node, "sub")))}`;
    case "sSubSup":
      return `${group(inner(child(node, "e")))}_${group(inner(child(node, "sub")))}^${group(inner(child(node, "sup")))}`;
    case "sPre":
      return `_${group(inner(child(node, "sub")))}^${group(inner(child(node, "sup")))}${inner(child(node, "e"))}`;
    case "rad": {
      const degree = inner(child(node, "deg")).trim();
      const body = inner(child(node, "e"));
      return degree ? `root(${degree})(${body})` : `sqrt(${body})`;
    }
    case "d": {
      const open = prop(node, "dPr", "begChr") ?? "(";
      const close = prop(node, "dPr", "endChr") ?? ")";
      const sep = prop(node, "dPr", "sepChr") ?? ",";
      return `${open}${children(node, "e").map((e) => inner(e)).join(sep)}${close}`;
    }
    case "nary": {
      const symbol = prop(node, "naryPr", "chr") ?? "∫";
      const sub = inner(child(node, "sub")).trim();
      const sup = inner(child(node, "sup")).trim();
      return `${symbol}${sub ? `_${group(sub)}` : ""}${sup ? `^${group(sup)}` : ""} ${inner(child(node, "e"))}`;
    }
    case "func":
      return `${inner(child(node, "fName"))}${inner(child(node, "e"))}`;
    case "limLow":
      return `${inner(child(node, "e"))}_${group(inner(child(node, "lim")))}`;
    case "limUpp":
      return `${inner(child(node, "e"))}^${group(inner(child(node, "lim")))}`;
    case "eqArr":
      return children(node, "e").map((e) => inner(e)).join("; ");
    case "m":
      return `[${children(node, "mr")
        .map((row) => children(row, "e").map((e) => inner(e)).join(", "))
        .join("; ")}]`;
    default:
      // Properties carry formatting, not content.
      if (node.localName?.endsWith("Pr")) return "";
      return inner(node);
  }
}

/** A Word run holding the text, to stand where the equation stood. */
function textRun(doc: { createElementNS(ns: string, name: string): unknown; createTextNode(t: string): unknown }, text: string) {
  const run = doc.createElementNS(W_NS, "w:r") as { appendChild(n: unknown): void };
  const t = doc.createElementNS(W_NS, "w:t") as {
    setAttribute(n: string, v: string): void;
    appendChild(n: unknown): void;
  };
  t.setAttribute("xml:space", "preserve");
  t.appendChild(doc.createTextNode(text));
  run.appendChild(t);
  return run;
}

/**
 * The same .docx with every equation replaced by a run of its plain text. Throws
 * on a file it cannot open; the caller falls back to reading the file as it was.
 */
export async function inlineDocxMath(docx: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(docx);
  const part = zip.file("word/document.xml");
  if (!part) return docx;
  const xml = await part.async("string");
  if (!xml.includes("oMath")) return docx;

  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const replace = (localName: string) => {
    const found = Array.from(doc.getElementsByTagNameNS(M_NS, localName)) as unknown as XNode[];
    for (const el of found) {
      if (!el.parentNode) continue; // inside one already replaced
      const text =
        localName === "oMathPara"
          ? children(el, "oMath").map(linear).join("; ")
          : linear(el);
      (el.parentNode as unknown as { replaceChild(a: unknown, b: unknown): void }).replaceChild(
        textRun(doc as unknown as Parameters<typeof textRun>[0], text),
        el
      );
    }
  };
  replace("oMathPara");
  replace("oMath");

  zip.file("word/document.xml", new XMLSerializer().serializeToString(doc));
  return zip.generateAsync({ type: "nodebuffer" });
}
