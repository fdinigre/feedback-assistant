/**
 * Synthetic IB DP marking check — exercises gradeDpQuestion against six
 * hand-built cases covering the hard P8/P9 rules (ft, FUW, mis-read, crossed-out,
 * 3 s.f. precision, answer-given). Runs the REAL `claude` CLI (logged in on this
 * machine) via a DB-free runner, so it NEVER touches data/app.db.
 *
 * Run with the react-server export condition so the `import "server-only"`
 * guards in the imported modules resolve to the empty no-op build:
 *   npx tsx --conditions=react-server scripts/dp-synthetic-check.ts
 */
import { spawn } from "node:child_process";

import { DEFAULT_DP_RULES, gradeDpQuestion } from "../lib/pipeline/grade-dp";
import { parseJson } from "../lib/pipeline/json";
import type { DpGradingQuestion, DpQuestionScheme, TranscriptQuestion } from "../lib/types";

const CLAUDE_BIN = "/opt/homebrew/bin/claude";

// --- DB-free CLI runner (mirrors lib/ai/claude.ts spawn, no ai_requests logging) ---
function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(ANTHROPIC_|CLAUDE)/i.test(k)) continue;
    if (k === "BAGGAGE" || k === "AI_AGENT") continue;
    env[k] = v;
  }
  return env;
}

function runClaudeText(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, ["-p", "--output-format", "text"], {
      cwd: process.cwd(),
      env: cleanEnv(),
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("claude CLI timed out"));
    }, 10 * 60 * 1000);
    child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf-8")));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`claude exited ${code}: ${stderr.trim() || stdout.trim()}`));
      else resolve(stdout);
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

const JSON_REMINDER =
  "\n\nIMPORTANT: Return ONLY the raw JSON value — no prose, no explanation, no ```code fences```.";

async function runJson<T>(opts: { prompt: string }): Promise<T> {
  const first = await runClaudeText(opts.prompt);
  try {
    return parseJson<T>(first);
  } catch {
    const retry = await runClaudeText(opts.prompt + JSON_REMINDER);
    return parseJson<T>(retry);
  }
}

// --- Case fixtures ---
type Case = {
  name: string;
  scheme: DpQuestionScheme;
  transcript: TranscriptQuestion;
  expectedAwarded: string[]; // markIds expected awarded=true
  explain: string;
};

function tq(steps: string[], opts: Partial<TranscriptQuestion> = {}): TranscriptQuestion {
  return {
    questionNumber: "1",
    steps: steps.map((text) => ({ text, confident: true })),
    illegible: [],
    blank: false,
    ...opts,
  };
}

const cases: Case[] = [
  // 1. Follow-through: wrong mean in (a) reused correctly in (b) whose marks are ft.
  {
    name: "1 follow-through (ft)",
    explain: "(a) mean wrong (12, should be 10) -> A1 denied but M1 kept; (b) uses 12 correctly, (M1)A1 ft -> awarded",
    scheme: {
      totalMarks: 4,
      subparts: [
        {
          label: "a",
          maxMarks: 2,
          scheme: "mean = (sum of the five values)/5 = 10",
          notes: [],
          marks: [
            { id: "a-1", code: "M1", implied: false, ft: false, value: 1, descriptor: "adds the values and divides by 5 (method for the mean)" },
            { id: "a-2", code: "A1", implied: false, ft: false, value: 1, descriptor: "mean = 10" },
          ],
        },
        {
          label: "b",
          maxMarks: 2,
          scheme: "expected total = their mean × 2",
          notes: [],
          marks: [
            { id: "b-1", code: "(M1)", implied: true, ft: true, value: 1, descriptor: "multiplies their mean by 2 (follow through their (a))" },
            { id: "b-2", code: "A1", implied: false, ft: true, value: 1, descriptor: "correct value of their mean × 2 (follow through)" },
          ],
        },
      ],
    },
    transcript: tq([
      "(a) sum = 40 + 8 + 4 + 6 + 2 = 60",
      "(a) mean = 60/5 = 12",
      "(b) expected total = 12 × 2 = 24",
    ]),
    expectedAwarded: ["a-1", "b-1", "b-2"],
  },

  // 2. Further working: correct 8√2 then a wrong decimal, then end -> A1 retained.
  {
    name: "2 further working (FUW)",
    explain: "correct answer 8√2 seen, then wrong decimal 5.7 ignored -> A1 kept",
    scheme: {
      totalMarks: 2,
      subparts: [
        {
          label: "",
          maxMarks: 2,
          scheme: "= 8√2 (= 11.3, 11.313…)",
          notes: [],
          marks: [
            { id: "m1", code: "M1", implied: false, ft: false, value: 1, descriptor: "correct simplification of the surd" },
            { id: "a1", code: "A1", implied: false, ft: false, value: 1, descriptor: "8√2 (or 11.3 or more precise)" },
          ],
        },
      ],
    },
    transcript: tq(["= √128", "= 8√2", "= 5.65685 ≈ 5.7"]),
    expectedAwarded: ["m1", "a1"],
  },

  // 3. Mis-read: copies 3.2 as 32, solves consistently -> withhold first mark only.
  {
    name: "3 mis-read (MR)",
    explain: "reads 3.2 from stem as 32, method correct on 32 -> withhold first mark, award rest",
    scheme: {
      totalMarks: 2,
      subparts: [
        {
          label: "",
          maxMarks: 2,
          scheme: "area = π r^2 with r = 3.2  ->  area = 32.2 (32.169…)",
          notes: [],
          marks: [
            { id: "m1", code: "M1", implied: false, ft: false, value: 1, descriptor: "substitutes r into π r^2 correctly" },
            { id: "a1", code: "A1", implied: false, ft: false, value: 1, descriptor: "correct area for the value used" },
          ],
        },
      ],
    },
    transcript: tq(["area = π × 32^2", "= π × 1024", "= 3217 (3216.99…)"]),
    expectedAwarded: ["a1"],
  },

  // 4. Crossed-out / scratch: correct work but rejected -> nothing.
  {
    name: "4 crossed-out",
    explain: "correct x=5 but marked [scratch]/crossed out -> no marks",
    scheme: {
      totalMarks: 2,
      subparts: [
        {
          label: "",
          maxMarks: 2,
          scheme: "solve 2x = 10 -> x = 5",
          notes: [],
          marks: [
            { id: "m1", code: "M1", implied: false, ft: false, value: 1, descriptor: "divides both sides by 2" },
            { id: "a1", code: "A1", implied: false, ft: false, value: 1, descriptor: "x = 5" },
          ],
        },
      ],
    },
    transcript: tq(["[scratch] 2x = 10", "[scratch] x = 10/2 = 5   (crossed out by the student)"]),
    expectedAwarded: [],
  },

  // 5a. Precision: 5858.30 vs scheme 5860 (5858.30…) -> awarded (more precise than 3 s.f.).
  {
    name: "5a precision >=3 s.f.",
    explain: "5000 × 1.02^8 = 5858.30 (more precise than the 3 s.f. value 5860) -> A1 awarded",
    scheme: {
      totalMarks: 2,
      subparts: [
        {
          label: "",
          maxMarks: 2,
          scheme: "value = 5000 × 1.02^8 = 5860 (5858.30…)",
          notes: [],
          marks: [
            { id: "m1", code: "M1", implied: false, ft: false, value: 1, descriptor: "correct set-up 5000 × 1.02^8" },
            { id: "a1", code: "A1", implied: false, ft: false, value: 1, descriptor: "5860 (5858.30…), or any consistent more-precise value" },
          ],
        },
      ],
    },
    transcript: tq(["= 5000 × 1.02^8", "= 5858.30"]),
    expectedAwarded: ["m1", "a1"],
  },

  // 5b. Precision: 5900 (2 s.f.) -> A0 for the answer, M1 kept.
  {
    name: "5b precision <3 s.f.",
    explain: "answer 5900 (only 2 s.f. of 5858.30) -> A1 denied, M1 kept",
    scheme: {
      totalMarks: 2,
      subparts: [
        {
          label: "",
          maxMarks: 2,
          scheme: "value = 5000 × 1.02^8 = 5860 (5858.30…)",
          notes: [],
          marks: [
            { id: "m1", code: "M1", implied: false, ft: false, value: 1, descriptor: "correct set-up 5000 × 1.02^8" },
            { id: "a1", code: "A1", implied: false, ft: false, value: 1, descriptor: "5860 (5858.30…); fewer than 3 s.f. does not earn this mark" },
          ],
        },
      ],
    },
    transcript: tq(["= 5000 × 1.02^8", "= 5900"]),
    expectedAwarded: ["m1"],
  },

  // 6. Answer given: restates x=5 with no working -> zero.
  {
    name: "6 answer given (AG)",
    explain: "\"show that x = 5\": answer restated with no development -> 0",
    scheme: {
      totalMarks: 2,
      subparts: [
        {
          label: "",
          maxMarks: 2,
          scheme: "show that x = 5  (AG). Requires the full development.",
          notes: [],
          marks: [
            { id: "m1", code: "M1", implied: false, ft: false, value: 1, descriptor: "sets up the equation and shows the algebra toward x = 5" },
            { id: "a1", code: "A1", implied: false, ft: false, value: 1, descriptor: "AG: reaches x = 5 with correct working (the answer alone earns nothing)" },
          ],
        },
      ],
    },
    transcript: tq(["(a) x = 5"]),
    expectedAwarded: [],
  },
];

function awardedIds(g: DpGradingQuestion): string[] {
  return g.subparts.flatMap((sp) => sp.awards.filter((a) => a.awarded).map((a) => a.markId)).sort();
}

function sameSet(a: string[], b: string[]): boolean {
  const bs = new Set(b);
  return a.length === b.length && a.every((x) => bs.has(x));
}

async function main() {
  console.log("DP synthetic marking check — 6 cases (real claude CLI, no DB)\n");
  let pass = 0;
  for (const c of cases) {
    const expected = [...c.expectedAwarded].sort();
    let got: string[] = [];
    let err: string | null = null;
    try {
      const grading = await gradeDpQuestion(c.transcript, c.scheme, DEFAULT_DP_RULES, {
        questionNumber: "1",
        pseudonym: "S-0000",
        forbiddenNames: [],
        runJson: runJson as never,
      });
      got = awardedIds(grading);
    } catch (e) {
      err = (e as Error).message;
    }
    const ok = err === null && sameSet(expected, got);
    if (ok) pass++;
    console.log(`${ok ? "PASS" : "FAIL"}  Case ${c.name}`);
    console.log(`      ${c.explain}`);
    console.log(`      expected awarded: [${expected.join(", ")}]`);
    console.log(`      obtained awarded: [${err ? "ERROR: " + err : got.join(", ")}]\n`);
  }
  console.log(`Scoreboard: ${pass}/${cases.length} cases passed.`);
  process.exit(pass === cases.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
