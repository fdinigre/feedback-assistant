// Generates two synthetic "handwritten" demo tests for trying the pipeline
// without real scans. Run: npx tsx scripts/gen-demo-pdfs.mts
import * as mupdf from "mupdf";

function makeTest(outPath: string, studentName: string, work1: string[], work2: string[]) {
  const doc = new mupdf.PDFDocument();
  const mediabox: mupdf.Rect = [0, 0, 612, 792];
  const font = doc.addSimpleFont(new mupdf.Font("Times-Roman"));
  function page(lines: [string, number, number, number][]) {
    let content = "";
    for (const [text, x, y, size] of lines) {
      content += `BT /F1 ${size} Tf ${x} ${792 - y} Td (${text.replace(/[()\\]/g, "")}) Tj ET\n`;
    }
    const res = doc.addObject({ Font: { F1: font } });
    const p = doc.addPage(mediabox, 0, res, content);
    doc.insertPage(-1, p);
  }
  const p1: [string, number, number, number][] = [
    [`Name: ${studentName}`, 50, 60, 16],
    ["Grade 9 Extended - Trigonometry Test (Demo)", 50, 90, 12],
    ["Q1. A ladder leans at 35 deg, base 12 m from wall. Find height h.", 50, 140, 11],
    ...work1.map((l, i) => [l, 70, 180 + i * 28, 12] as [string, number, number, number]),
  ];
  const p2: [string, number, number, number][] = [
    ["Q2. Triangle ABC: a=8, A=40deg, B=65deg. Find b.", 50, 80, 11],
    ...work2.map((l, i) => [l, 70, 120 + i * 28, 12] as [string, number, number, number]),
  ];
  page(p1); page(p2);
  doc.save(outPath);
  console.log("wrote", outPath);
}

makeTest("data/demo/alice-trig.pdf", "Alice Testson",
  ["tan(35) = h / 12", "h = 12 x tan(35)", "h = 8.40 m (3sf)"],
  ["b / sin(65) = 8 / sin(40)", "b = 8 sin(65) / sin(40)", "b = 11.3 (3sf)"]);
makeTest("data/demo/bruno-trig.pdf", "Bruno Provado",
  ["tan(35) = 12 / h", "h = 12 / tan(35) = 17.1 m"],
  []);
