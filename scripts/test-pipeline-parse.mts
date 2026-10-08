/**
 * Unit tests for the robust JSON parser used by all three pipeline stages.
 * Pure module (no server-only / DB / AI), so it runs standalone:
 *   npx tsx scripts/test-pipeline-parse.mts
 */
import { extractFirstJson, parseJson } from "../lib/pipeline/json";
import { reconcileSubParts } from "../lib/pipeline/subparts";
import type { TranscriptQuestion } from "../lib/types";

let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function expectThrow(name: string, fn: () => unknown) {
  try {
    fn();
    failed++;
    console.error(`  FAIL  ${name} — expected throw, but it returned`);
  } catch {
    passed++;
    console.log(`  PASS  ${name}`);
  }
}

console.log("JSON parser fixtures:\n");

// 1. Clean array (transcribe happy path).
{
  const raw = `[{"questionNumber":"1","steps":[{"text":"x=2","confident":true}],"illegible":[],"blank":false}]`;
  const parsed = parseJson<TranscriptQuestion[]>(raw);
  ok("clean array parses", Array.isArray(parsed) && parsed[0].questionNumber === "1");
}

// 2. Prose before and after the JSON.
{
  const raw = `Here is the transcription you asked for:\n[{"questionNumber":"2a","steps":[],"illegible":[],"blank":true}]\nLet me know if you need anything else.`;
  const parsed = parseJson<TranscriptQuestion[]>(raw);
  ok("prose-wrapped array parses", parsed.length === 1 && parsed[0].blank === true);
}

// 3. Fenced ```json block.
{
  const raw = "```json\n[{\"questionNumber\":\"3\",\"steps\":[{\"text\":\"a[?]b\",\"confident\":false}],\"illegible\":[{\"stepIndex\":0,\"note\":\"cannot read middle symbol\"}],\"blank\":false}]\n```";
  const parsed = parseJson<TranscriptQuestion[]>(raw);
  ok("fenced json block parses", parsed[0].illegible[0].note.includes("cannot read"));
}

// 4. Object (level proposal) with a bracket inside a string value — must not
//    fool the balanced scanner.
{
  const raw = `{"level":6,"conservativeLevel":5,"evidence":"Q1 shows [good] method; array-like notation [1,2] used"}`;
  const parsed = parseJson<{ level: number; evidence: string }>(raw);
  ok("brackets inside strings handled", parsed.level === 6 && parsed.evidence.includes("[1,2]"));
}

// 5. Escaped quote inside a string.
{
  const raw = `[{"questionNumber":"5","steps":[{"text":"he wrote \\"sin\\" here","confident":true}],"illegible":[],"blank":false}]`;
  const parsed = parseJson<TranscriptQuestion[]>(raw);
  ok("escaped quotes handled", parsed[0].steps[0].text.includes(`"sin"`));
}

// 6. extractFirstJson returns exactly the balanced slice.
{
  const raw = `noise {"a":1} trailing {"b":2}`;
  ok("extract stops at first balanced value", extractFirstJson(raw) === `{"a":1}`);
}

// 7. Malformed / no JSON -> throws (fail loudly).
expectThrow("no-json throws", () => parseJson("the model refused and wrote only prose"));

// 8. Truncated JSON -> throws.
expectThrow("truncated json throws", () => parseJson(`[{"questionNumber":"1",`));

console.log("\nSub-part reconciliation fixtures:\n");

function tq(questionNumber: string, partial?: Partial<TranscriptQuestion>): TranscriptQuestion {
  return { questionNumber, steps: [], illegible: [], blank: true, ...partial };
}

// 9. Definition has "4"; model returned "4b" + "4a" (out of order) -> merged
//    under "4" in a/b order, blocks prefixed, illegible indexes re-based.
{
  const byNumber = new Map<string, TranscriptQuestion>([
    [
      "4b",
      tq("4b", {
        steps: [{ text: "x = [?]", confident: false }],
        illegible: [{ stepIndex: 0, note: "cannot read value" }],
        blank: false,
      }),
    ],
    [
      "4a",
      tq("4a", {
        steps: [
          { text: "sin(x) = 3/5", confident: true },
          { text: "x = 36.9", confident: true },
        ],
        blank: false,
      }),
    ],
  ]);
  const r = reconcileSubParts("4", byNumber, new Set(["4"]));
  ok("sub-parts merge under parent", r.kind === "merged");
  if (r.kind === "merged") {
    ok("merged from lists sub-parts in order", r.from.join(",") === "4a,4b");
    ok(
      "blocks ordered a then b with prefixes",
      r.question.steps.length === 3 &&
        r.question.steps[0].text === "a) sin(x) = 3/5" &&
        r.question.steps[1].text === "x = 36.9" &&
        r.question.steps[2].text === "b) x = [?]"
    );
    ok(
      "illegible index re-based to merged steps",
      r.question.illegible.length === 1 && r.question.illegible[0].stepIndex === 2
    );
    ok("merged question is not blank", r.question.blank === false);
    ok("merged keeps parent number", r.question.questionNumber === "4");
  }
}

// 10. Sub-part-looking numbers the merge doesn't handle ("4ii") -> unmergeable,
//     so transcribe can emit the specific warning instead of the generic one.
{
  const byNumber = new Map<string, TranscriptQuestion>([["4ii", tq("4ii", { blank: false })]]);
  const r = reconcileSubParts("4", byNumber, new Set(["4"]));
  ok(
    "roman-numeral sub-part reported as unmergeable",
    r.kind === "unmergeable" && r.keys.join(",") === "4ii"
  );
}

// 11. "41" is a different question, not a sub-part of "4".
{
  const byNumber = new Map<string, TranscriptQuestion>([["41", tq("41")]]);
  const r = reconcileSubParts("4", byNumber, new Set(["4"]));
  ok("digit suffix is not a sub-part", r.kind === "none");
}

// 12. A number that is itself a defined question is never merged away:
//     definition has both "4" and "4a"; "4a" belongs to its own row.
{
  const byNumber = new Map<string, TranscriptQuestion>([["4a", tq("4a", { blank: false })]]);
  const r = reconcileSubParts("4", byNumber, new Set(["4", "4a"]));
  ok("defined sub-part question is not consumed", r.kind === "none");
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("Pipeline JSON parser tests PASSED.");
