import "server-only";

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { insertAiRequest, updateAiRequestResponse } from "@/lib/db/queries";
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
 * Refuses unless the Google account `agy` is signed in to is a school one.
 *
 * Read from the account record the Gemini tools keep in ~/.gemini — the file is
 * rewritten at each sign-in, alongside the credentials. Fails closed: if the
 * account cannot be read, it cannot be shown to be the school's.
 */
function assertSchoolAccount(): void {
  const file = path.join(os.homedir(), ".gemini", "google_accounts.json");
  let active: unknown = null;
  try {
    active = (JSON.parse(fs.readFileSync(file, "utf8")) as { active?: unknown }).active;
  } catch {
    // Unreadable or missing: handled below as "cannot confirm".
  }
  const school = ALLOWED_GOOGLE_DOMAINS[0];
  if (typeof active !== "string" || !active.includes("@")) {
    throw new GeminiSetupError(
      `Couldn't confirm which Google account Gemini is signed in to, so nothing was sent. ` +
        `Sign in again with your @${school} account (re-run Install Feedback Assistant and take the sign-in step).`,
      "wrong-account"
    );
  }
  if (!isSchoolAccount(active)) {
    const domain = active.split("@").pop()!.toLowerCase();
    throw new GeminiSetupError(
      `Gemini is signed in with an @${domain} account. Student work may only go through your ` +
        `@${school} school account, so nothing was sent. Re-run Install Feedback Assistant and ` +
        `sign in with your school account.`,
      "wrong-account"
    );
  }
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

const GEMINI_BIN = resolveGeminiBin();
const AI_LOG_DIR = path.join(process.cwd(), "data", "ai-log");
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
    const child = spawn(GEMINI_BIN, args, { cwd, env: childEnv, stdio: ["ignore", "pipe", "pipe"] });

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
        // No "permission" here: agy also reports a refused tool call that way,
        // and that is not something signing in again would fix.
        const isAuth = /login|log ?in|auth|oauth|credential|api[_ ]?key|unauthenticated|sign ?in/i.test(detail);
        reject(
          isAuth
            ? new GeminiSetupError(
                "AI is unavailable: Google's Antigravity command (agy) isn't signed in on this computer. " +
                  "Open Terminal, run `agy`, and sign in once with your Google account — then try again. " +
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
 * The newest Flash at high effort, from lines like
 * "gemini-3.8-flash-high<TAB>Gemini 3.8 Flash (High)". Any Gemini model if no
 * Flash is listed; null if no Gemini model is. Read from `agy models` rather
 * than written here because Google renames these often, and `agy -p` fails
 * outright on a name it does not know.
 */
export function pickGeminiModel(listing: string): string | null {
  const slugs = listing
    .split("\n")
    .map((line) => line.trim().split(/\s+/)[0] ?? "")
    .filter((slug) => /^gemini-/.test(slug));
  const version = (slug: string) => {
    const m = slug.match(/^gemini-(\d+)\.(\d+)-/);
    return m ? Number(m[1]) * 1000 + Number(m[2]) : -1;
  };
  const flash = slugs
    .filter((slug) => /-flash-high$/.test(slug))
    .sort((a, b) => version(b) - version(a));
  return flash[0] ?? slugs[0] ?? null;
}

const MODEL_TTL_MS = 60 * 60 * 1000; // re-read the list hourly; the server runs for days
let modelCache: { slug: string; at: number } | null = null;

async function geminiModel(): Promise<string> {
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
  if (modelCache && Date.now() - modelCache.at < MODEL_TTL_MS) return modelCache.slug;
  const listing = await runAgy(["models"], os.tmpdir(), "models", 60_000);
  const slug = pickGeminiModel(listing);
  if (!slug) {
    throw new Error(
      "AI is unavailable: Antigravity (agy) offers no Gemini model to this account, and this backend " +
        "will not use any other. Nothing was sent."
    );
  }
  modelCache = { slug, at: Date.now() };
  return slug;
}

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
  assertSchoolAccount();
  const model = await geminiModel();

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
      pages.length > 0
        ? `${prompt}\n\n${pages.map((p) => `Read the image file at ${p}`).join("\n")}`
        : prompt;

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
    const response = await runAgy(args, workspace, purpose, TIMEOUT_MS + 30_000);

    // 4. Save the response and update the ai_requests row.
    fs.writeFileSync(responseFile, response, "utf-8");
    updateAiRequestResponse(aiRequest.id, responseFile);

    return response;
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}
