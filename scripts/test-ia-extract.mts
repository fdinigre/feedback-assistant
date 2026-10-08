/**
 * Manual smoke test for lib/ia/extract.ts — builds a synthetic .docx (via
 * macOS `textutil`, txt -> docx) with a fake name ("Testy McTestface")
 * repeated across the body AND at the top/bottom of the document (standing
 * in for header/footer repetition), extracts its text, pseudonymizes it, and
 * confirms ZERO occurrences of the name (in any form) survive.
 *
 * No real student names are used. Run with: npx tsx scripts/test-ia-extract.mts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { extractDocxText, pseudonymizeText } from "../lib/ia/extract";

const FAKE_NAME = "Testy McTestface";
const PSEUDONYM = "S-9999";

function ok(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    process.exitCode = 1;
  }
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ia-extract-"));
  const txtPath = path.join(tmpDir, "sample.txt");
  const docxPath = path.join(tmpDir, "sample.docx");

  const body = [
    `${FAKE_NAME}`, // stand-in for a document header repeating the name
    "Mathematical Exploration",
    "",
    `This exploration by ${FAKE_NAME} investigates modular arithmetic in cryptography.`,
    "The rationale for this topic came from a personal interest in cybersecurity.",
    "",
    "Section 1: Introduction",
    `${FAKE_NAME.toUpperCase()} began by defining the RSA algorithm formally.`,
    "",
    "Section 2: Reflection",
    `In conclusion, McTestface's understanding of number theory deepened.`,
    "",
    `${FAKE_NAME} | Page footer repeated name | ${FAKE_NAME}`, // stand-in for a footer repeating the name
  ].join("\n");

  fs.writeFileSync(txtPath, body, "utf-8");
  console.log("1. Converting synthetic .txt -> .docx via macOS textutil...");
  execFileSync("textutil", ["-convert", "docx", "-output", docxPath, txtPath]);
  ok("docx file created", fs.existsSync(docxPath) && fs.statSync(docxPath).size > 0);

  console.log("2. Extracting text with mammoth (lib/ia/extract.ts)...");
  const buffer = fs.readFileSync(docxPath);
  const raw = await extractDocxText(buffer);
  console.log(`   -> extracted ${raw.length} chars`);
  ok("raw text contains the fake name before pseudonymization", /testy/i.test(raw));

  console.log("3. Pseudonymizing the WHOLE extracted text...");
  const { text, replacements } = pseudonymizeText(raw, FAKE_NAME, PSEUDONYM);
  console.log(`   -> ${replacements} replacement(s) made`);
  ok("at least 5 replacements made (name appears >=5 times across the doc)", replacements >= 5, String(replacements));

  const leaked = /testy|mctestface/i.test(text);
  ok("ZERO occurrences of the name survive in the pseudonymized text", !leaked);
  ok("pseudonym appears in the cleaned text", text.includes(PSEUDONYM));

  console.log("\nCleaned text:\n---\n" + text + "\n---");

  fs.rmSync(tmpDir, { recursive: true, force: true });

  if (process.exitCode === 1) {
    console.error("\nIA extraction test FAILED.");
    process.exit(1);
  }
  console.log("\nIA extraction test PASSED.");
}

main().catch((err) => {
  console.error("\nIA extraction test FAILED:");
  console.error(err);
  process.exit(1);
});
