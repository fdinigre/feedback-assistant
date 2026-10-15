import "server-only";

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAppSetting, insertAiRequest, updateAiRequestResponse } from "@/lib/db/queries";
import { EFFORT_DEFAULTS, EFFORT_SETTING_KEY, effortKindOf, parseEffort, type Effort } from "@/lib/ai/effort";
import { nameRegex } from "@/lib/pipeline/guards";
import type { RunClaudeOptions } from "@/lib/ai/claude";

/**
 * Gemini backend — the counterpart to lib/ai/claude.ts, used when
 * MFA_AI_PROVIDER=gemini. It shells out to Google's Antigravity CLI (`agy`),
 * which replaced the `gemini` CLI for personal Google accounts in June 2026 and
 * authenticates with the user's OWN Google account — no key is stored in the
 * app. The privacy contract is identical to the Claude path: the same
 * forbidden-name guard runs before anything is sent or logged, and every
 * outbound prompt is written to data/ai-log first.
 *
 * `agy` is an agent that may read and write files in the folder it runs in, so
 * it never runs in the app folder, where the database holds real names. Each
 * call gets a fresh empty folder holding only that call's page images, under
 * neutral names, and the folder is removed afterwards.
 *
 * Antigravity also offers other companies' models (Claude, GPT-OSS). This
 * backend only ever runs a Gemini model, named on every call, so student work
 * cannot follow whatever model was last picked in `agy` itself.
 *
 * Invocation is configurable by env, because the flags a given `agy` build
 * wants for non-interactive use can change:
 *   MFA_GEMINI_BIN    - path to the agy binary (else auto-detected / PATH)
 *   MFA_GEMINI_MODEL  - a Gemini model slug from `agy models`; else the newest Flash
 *   MFA_GEMINI_ARGS   - extra CLI args, space-separated, inserted before the prompt
 */

/**
 * The two failures that mean "this Mac is not set up for Gemini", as opposed to
 * a call that ran and went wrong. Callers that word their own setup advice check
 * `problem` rather than the message text.
 */
export class GeminiSetupError extends Error {
  constructor(
    message: string,
    readonly problem: "not-installed" | "not-signed-in" | "wrong-account"
  ) {
    super(message);
    this.name = "GeminiSetupError";
  }
}

/**
 * The Google Workspace domains student work may go to. The school has approved
 * its own Gemini accounts for student data; a personal Gmail has not been, and
 * the sign-in screen makes it easy to pick the wrong one of the two.
 */
export const ALLOWED_GOOGLE_DOMAINS = ["thekaustschool.org"];

/** Whether a signed-in Google account belongs to the school (a subdomain counts). */
export function isSchoolAccount(email: unknown): boolean {
  if (typeof email !== "string" || !email.includes("@")) return false;
  const domain = email.split("@").pop()!.trim().toLowerCase();
  return ALLOWED_GOOGLE_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * The account `agy` signed in as, from a log it wrote. agy keeps its sign-in in
 * the macOS Keychain and has no "who am I" command, but every run logs the
 * account it authenticated as, e.g.
 *   applyAuthResult: email=someone@thekaustschool.org, authMethod=consumer
 */
export function accountFromAgyLog(log: string): string | null {
  const m =
    /applyAuthResult: email=([^\s,]+@[^\s,]+)/.exec(log) ??
    /authenticated successfully as (\S+@\S+)/.exec(log);
  return m ? m[1] : null;
}

/**
 * Refuses unless the Google account `agy` is signed in to is a school one.
 *
 * Checked with `agy models`, which signs in and lists the models but sends no
 * prompt, so the check itself carries nothing about any student. Not from
 * ~/.gemini/google_accounts.json: that belongs to Google's older gemini tool,
 * agy never writes it, and a copy left over from that tool could name a
 * different account from the one agy is actually using.
 *
 * Fails closed: an account that cannot be read cannot be shown to be the
 * school's. The answer is reused for a few minutes, since a batch of marking
 * makes dozens of calls; the model list it returns is kept for the same calls.
 */
const ACCOUNT_TTL_MS = 5 * 60 * 1000;
let accountCache: { email: string; listing: string; at: number } | null = null;

/** Signs in with `agy models` (no prompt sent) and reads back which account it used. */
async function readAgyAccount(): Promise<{ email: string | null; listing: string }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-account-"));
  try {
    const logFile = path.join(dir, "agy.log");
    const listing = await runAgy(["--log-file", logFile, "models"], dir, "account check", 60_000);
    const email = fs.existsSync(logFile) ? accountFromAgyLog(fs.readFileSync(logFile, "utf8")) : null;
    return { email, listing };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export type AccountStatus = {
  state: "ok" | "wrong-account" | "not-signed-in" | "not-installed" | "error";
  email: string | null;
  /** For Claude, the plan ("max", "pro"); not known for Gemini. */
  plan?: string | null;
  message?: string;
};

/** Which Google account Gemini would mark through, for the Settings page. Sends no prompt. */
export async function geminiAccountStatus(): Promise<AccountStatus> {
  try {
    const { email } = await readAgyAccount();
    if (!email) return { state: "not-signed-in", email: null };
    return { state: isSchoolAccount(email) ? "ok" : "wrong-account", email };
  } catch (err) {
    if (err instanceof GeminiSetupError) {
      return { state: err.problem === "not-installed" ? "not-installed" : "not-signed-in", email: null };
    }
    return { state: "error", email: null, message: (err as Error).message };
  }
}

async function checkSchoolAccount(): Promise<string> {
  if (accountCache && Date.now() - accountCache.at < ACCOUNT_TTL_MS) return accountCache.listing;

  const { email, listing } = await readAgyAccount();

  const school = ALLOWED_GOOGLE_DOMAINS[0];
  if (!email) {
    throw new GeminiSetupError(
      `Couldn't confirm which Google account Gemini is signed in to, so nothing was sent. ` +
        `Sign in again with your @${school} account (run Install Feedback Assistant again and take the sign-in step).`,
      "wrong-account"
    );
  }
  if (!isSchoolAccount(email)) {
    const domain = email.split("@").pop()!.toLowerCase();
    throw new GeminiSetupError(
      `Gemini is signed in with an @${domain} account. Student work may only go through your ` +
        `@${school} school account, so nothing was sent. Run Install Feedback Assistant again and ` +
        `sign in with your school account.`,
      "wrong-account"
    );
  }
  accountCache = { email, listing, at: Date.now() };
  return listing;
}

function resolveGeminiBin(): string {
  const override = process.env.MFA_GEMINI_BIN;
  if (override) return override;
  const home = process.env.HOME ?? "";
  const candidates = [
    home ? `${home}/.local/bin/agy` : "", // where Google's installer puts it
    "/opt/homebrew/bin/agy",
    "/usr/local/bin/agy",
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return "agy"; // fall back to PATH lookup
}

// The automated checks point this at a throwaway folder (tests/setup.ts).
const AI_LOG_DIR = process.env.MFA_AI_LOG_DIR || path.join(process.cwd(), "data", "ai-log");
const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/** Case-insensitive, Unicode-letter-bounded search for any forbidden name. Returns the match, or null. */
function findForbiddenName(text: string, forbiddenNames: string[]): string | null {
  for (const rawName of forbiddenNames) {
    const name = rawName.trim();
    if (!name) continue;
    if (nameRegex(name, "i").test(text)) return name;
  }
  return null;
}

/** Runs `agy` once and resolves with its stdout, turning setup failures into GeminiSetupError. */
function runAgy(args: string[], cwd: string, label: string, timeoutMs: number): Promise<string> {
  // Keep the full environment: unlike the Claude adapter (which strips
  // ANTHROPIC_/CLAUDE session vars), agy may need GEMINI_API_KEY when it is set
  // up to use a key rather than a Google sign-in.
  const childEnv = { ...process.env };

  return new Promise<string>((resolve, reject) => {
    const child = spawn(resolveGeminiBin(), args, { cwd, env: childEnv, stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`runGemini: "${label}" timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const notInstalled = (err as NodeJS.ErrnoException).code === "ENOENT";
      reject(
        notInstalled
          ? new GeminiSetupError(
              "AI is unavailable: Google's Antigravity command (agy) isn't installed on this computer. " +
                "Install it by running  curl -fsSL https://antigravity.google/cli/install.sh | bash  in Terminal, " +
                "then run agy once and sign in with your Google account to use transcription, grading and " +
                "reports — everything else works without it.",
              "not-installed"
            )
          : new Error(`AI is unavailable: could not start the 'agy' command (${err.message}).`)
      );
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        const detail = stderr.trim() || stdout.trim() || "(no output)";
        const quota = quotaMessage(detail);
        if (quota) {
          reject(new Error(quota));
          return;
        }
        // No "permission" here: agy also reports a refused tool call that way,
        // and that is not something signing in again would fix.
        const isAuth = /login|log ?in|auth|oauth|credential|api[_ ]?key|unauthenticated|sign ?in/i.test(detail);
        reject(
          isAuth
            ? new GeminiSetupError(
                "AI is unavailable: Gemini isn't signed in on this computer. Run Install Feedback Assistant " +
                  "again and take the sign-in step, with your school Google account — then try again. " +
                  "Everything else works without it.",
                "not-signed-in"
              )
            : new Error(`AI is unavailable: the 'agy' command failed (exit ${code}). Details: ${detail}`)
        );
        return;
      }
      resolve(stdout);
    });
  });
}

/**
 * A plain sentence for Google's "Individual quota reached ... Resets in 167h4m46s"
 * (RESOURCE_EXHAUSTED, HTTP 429), or null when the failure is something else. The
 * raw error reads like the app is broken; what the teacher needs is when it comes
 * back, and that Claude is one click away in the meantime.
 */
export function quotaMessage(detail: string): string | null {
  if (!/RESOURCE_EXHAUSTED|quota (reached|exceeded)|code 429/i.test(detail)) return null;
  const m = /Resets in (?:(\d+)h)?(?:(\d+)m)?/i.exec(detail);
  const hours = m ? Number(m[1] ?? 0) + Number(m[2] ?? 0) / 60 : null;
  const when =
    hours === null
      ? ""
      : hours >= 36
        ? ` It resets in about ${Math.round(hours / 24)} days.`
        : hours >= 1
          ? ` It resets in about ${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"}.`
          : " It resets within the hour.";
  return (
    `Gemini's usage limit for this Google account has been reached, so nothing was sent.${when}` +
    " To keep marking now, switch to Claude in Settings → AI (it needs a Claude Pro or Max account)."
  );
}

/**
 * The newest Flash at the given effort, from lines like
 * "gemini-3.8-flash-high<TAB>Gemini 3.8 Flash (High)". Falls back to the newest
 * Flash at high effort, then to any Gemini model; null if no Gemini model is
 * listed. Read from `agy models` rather than written here because Google
 * renames these often, and `agy -p` fails outright on a name it does not know.
 */
export function pickGeminiModel(listing: string, effort: Effort = "high"): string | null {
  const slugs = listing
    .split("\n")
    .map((line) => line.trim().split(/\s+/)[0] ?? "")
    .filter((slug) => /^gemini-/.test(slug));
  const version = (slug: string) => {
    const m = slug.match(/^gemini-(\d+)\.(\d+)-/);
    return m ? Number(m[1]) * 1000 + Number(m[2]) : -1;
  };
  const newestFlash = (level: Effort) =>
    slugs.filter((slug) => slug.endsWith(`-flash-${level}`)).sort((a, b) => version(b) - version(a))[0];
  return newestFlash(effort) ?? newestFlash("high") ?? slugs[0] ?? null;
}

/** The effort set in Settings for this kind of request, or its default. */
function effortFor(purpose: string): Effort {
  const kind = effortKindOf(purpose);
  return parseEffort(getAppSetting(EFFORT_SETTING_KEY[kind])) ?? EFFORT_DEFAULTS[kind];
}

async function geminiModel(listing: string, effort: Effort): Promise<string> {
  const pinned = process.env.MFA_GEMINI_MODEL?.trim();
  if (pinned) {
    if (!/^gemini-/.test(pinned)) {
      throw new Error(
        `MFA_GEMINI_MODEL is "${pinned}", which is not a Gemini model. This backend only runs Gemini models; ` +
          "pick one from `agy models` or remove the setting. Nothing was sent."
      );
    }
    return pinned;
  }
  const slug = pickGeminiModel(listing, effort);
  if (!slug) {
    throw new Error(
      "AI is unavailable: Antigravity (agy) offers no Gemini model to this account, and this backend " +
        "will not use any other. Nothing was sent."
    );
  }
  return slug;
}

/**
 * Put before every prompt. agy is a coding agent: given a long task it may
 * decide to run a command or write a file, which print mode refuses, ending the
 * run with nothing said. The app only ever wants the answer itself.
 */
const ANSWER_DIRECTLY =
  "You are being used as a plain text model inside another application. Give your whole answer " +
  "directly in your reply. Do not run commands, create or edit files, search, or use any other " +
  "tool — except reading the image files named at the end, when there are any.";

export async function runGemini(opts: RunClaudeOptions): Promise<string> {
  // opts.model is a Claude alias ("haiku") and is ignored here: passing it on
  // could only name a model this backend refuses to use.
  const { purpose, prompt, imagePaths = [], forbiddenNames } = opts;

  // 1. PRIVACY GUARD — must run before anything is written to disk or spawned.
  const hitInPrompt = findForbiddenName(prompt, forbiddenNames);
  if (hitInPrompt) {
    throw new Error(
      `runGemini privacy guard: prompt contains forbidden name "${hitInPrompt}". Nothing was sent or logged.`
    );
  }
  const hitInPaths = findForbiddenName(imagePaths.join("\n"), forbiddenNames);
  if (hitInPaths) {
    throw new Error(
      `runGemini privacy guard: an image path contains forbidden name "${hitInPaths}". Nothing was sent or logged.`
    );
  }

  const extra = process.env.MFA_GEMINI_ARGS?.trim();
  if (extra && /(^|\s)--model\b/.test(extra)) {
    throw new Error("MFA_GEMINI_ARGS may not choose the model; use MFA_GEMINI_MODEL. Nothing was sent.");
  }
  // Before anything is logged: the wrong Google account, a Mac without agy, or
  // one without a Gemini model, stops here.
  const listing = await checkSchoolAccount();
  const model = await geminiModel(listing, effortFor(purpose));

  if (!fs.existsSync(AI_LOG_DIR)) {
    fs.mkdirSync(AI_LOG_DIR, { recursive: true });
  }

  // The agent's whole world for this call: an empty folder plus copies of the
  // page images. It is told where they are, the same way the Claude adapter is.
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-assistant-ai-"));
  try {
    const pages = imagePaths.map((src, i) => {
      const dest = path.join(workspace, `page-${i + 1}${path.extname(src).toLowerCase()}`);
      fs.copyFileSync(src, dest);
      return dest;
    });
    const fullPrompt =
      `${ANSWER_DIRECTLY}\n\n${prompt}` +
      (pages.length > 0 ? `\n\n${pages.map((p) => `Read the image file at ${p}`).join("\n")}` : "");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseName = `${timestamp}-${purpose}`;
    const promptFile = path.join(AI_LOG_DIR, `${baseName}-prompt.txt`);
    const responseFile = path.join(AI_LOG_DIR, `${baseName}-response.txt`);

    // 2. Log the full prompt + record the ai_requests row BEFORE spawning anything.
    fs.writeFileSync(promptFile, fullPrompt, "utf-8");
    const aiRequest = insertAiRequest({ purpose, prompt_file: promptFile });

    // 3. Build args. `agy -p` takes the prompt as an argument; macOS allows about
    // 1 MB of arguments, and the largest prompt the app builds is around 100 KB.
    // Slash commands are off so a student's answer that starts with "/" is text.
    const args = [
      "--output-format", "text",
      "--print-timeout", `${TIMEOUT_MS / 60000}m`,
      "--disable-slash-commands",
      "--sandbox",
      "--model", model,
    ];
    if (extra) args.push(...extra.split(/\s+/));
    args.push("-p", fullPrompt);

    // A little past agy's own --print-timeout, so its message wins when it can.
    let response = await runAgy(args, workspace, purpose, TIMEOUT_MS + 30_000);
    // agy is an agent. If it reaches for a command anyway, print mode refuses
    // the command and the run ends with no reply at all — which surfaced as a
    // baffling "no '{' found" from the JSON reader. Once more, then say so.
    if (!response.trim()) {
      response = await runAgy(args, workspace, `${purpose} (retry after empty reply)`, TIMEOUT_MS + 30_000);
    }
    if (!response.trim()) {
      fs.writeFileSync(responseFile, "", "utf-8");
      updateAiRequestResponse(aiRequest.id, responseFile);
      throw new Error(
        "Gemini sent back an empty reply twice (it tried to run a command instead of answering). " +
          "Nothing was changed — try again in a moment."
      );
    }

    // 4. Save the response and update the ai_requests row.
    fs.writeFileSync(responseFile, response, "utf-8");
    updateAiRequestResponse(aiRequest.id, responseFile);

    return response;
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}
