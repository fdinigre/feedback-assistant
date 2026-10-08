import "server-only";

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { insertAiRequest, updateAiRequestResponse } from "@/lib/db/queries";
import { nameRegex } from "@/lib/pipeline/guards";

/**
 * Locates the `claude` CLI so the app is portable across machines (e.g. a home
 * Mac and a work computer where Homebrew may live elsewhere or not at all).
 * Order: explicit MFA_CLAUDE_BIN override → common install locations → bare
 * "claude" resolved via PATH. The override is deliberately NOT prefixed with
 * CLAUDE_ because the child-env scrub below strips any CLAUDE- or ANTHROPIC-
 * prefixed vars.
 */
function resolveClaudeBin(): string {
  const override = process.env.MFA_CLAUDE_BIN;
  if (override) return override;
  const home = process.env.HOME ?? "";
  const candidates = [
    "/opt/homebrew/bin/claude", // Apple-silicon Homebrew
    "/usr/local/bin/claude", // Intel Homebrew / manual install
    home ? `${home}/.claude/local/claude` : "",
    home ? `${home}/.local/bin/claude` : "",
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return "claude"; // fall back to PATH lookup
}

const CLAUDE_BIN = resolveClaudeBin();
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

export type RunClaudeOptions = {
  purpose: string;
  prompt: string;
  imagePaths?: string[];
  forbiddenNames: string[];
  /**
   * A CLI model alias ("haiku", "sonnet", "opus") for work that does not need
   * the default. Transcribing and grading a paper do; sorting an existing
   * sentence into one of a dozen labelled boxes does not, and there are
   * hundreds of those to do.
   */
  model?: string;
};

/**
 * Runs a prompt through the user's Claude subscription via the headless `claude` CLI.
 * No Anthropic API key and no @anthropic-ai/sdk are used — this shells out to the
 * locally installed CLI, which authenticates via the user's existing subscription.
 */
export async function runClaude(opts: RunClaudeOptions): Promise<string> {
  const { purpose, prompt, imagePaths = [], forbiddenNames, model } = opts;

  // 1. PRIVACY GUARD — must run before anything is written to disk or spawned.
  const hitInPrompt = findForbiddenName(prompt, forbiddenNames);
  if (hitInPrompt) {
    throw new Error(
      `runClaude privacy guard: prompt contains forbidden name "${hitInPrompt}". Nothing was sent or logged.`
    );
  }
  const hitInPaths = findForbiddenName(imagePaths.join("\n"), forbiddenNames);
  if (hitInPaths) {
    throw new Error(
      `runClaude privacy guard: an image path contains forbidden name "${hitInPaths}". Nothing was sent or logged.`
    );
  }

  if (!fs.existsSync(AI_LOG_DIR)) {
    fs.mkdirSync(AI_LOG_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = `${timestamp}-${purpose}`;
  const promptFile = path.join(AI_LOG_DIR, `${baseName}-prompt.txt`);
  const responseFile = path.join(AI_LOG_DIR, `${baseName}-response.txt`);

  // Images aren't uploaded directly — the CLI is told to Read them from disk itself,
  // so the absolute paths (already privacy-checked above) are woven into the prompt text.
  const fullPrompt =
    imagePaths.length > 0
      ? `${prompt}\n\n${imagePaths.map((p) => `Read the image file at ${p}`).join("\n")}`
      : prompt;

  // 2. Log the full prompt + record the ai_requests row BEFORE spawning anything.
  fs.writeFileSync(promptFile, fullPrompt, "utf-8");
  const aiRequest = insertAiRequest({ purpose, prompt_file: promptFile });

  // 3. Spawn the headless CLI with the prompt on stdin.
  const args = ["-p", "--output-format", "text"];
  if (model) args.push("--model", model);
  if (imagePaths.length > 0) {
    args.push("--allowedTools", "Read");
    args.push("--add-dir", path.join(process.cwd(), "data"));
  }

  // Scrub inherited Claude/Anthropic session vars: when this app is launched from
  // inside a Claude Code session, those vars point the CLI at the parent session's
  // proxy/auth and break authentication (401). A clean child env makes the CLI use
  // the user's own login (keychain), same as running `claude` in their terminal.
  const childEnv: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(ANTHROPIC_|CLAUDE)/i.test(key)) continue;
    if (key === "BAGGAGE" || key === "AI_AGENT") continue;
    childEnv[key] = value;
  }

  const response = await new Promise<string>((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, args, {
      cwd: process.cwd(),
      env: childEnv,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`runClaude: "${purpose}" timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

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
      // ENOENT = the CLI isn't installed on this machine. The rest of the app works
      // without it; only the AI steps need it — say so plainly.
      const notInstalled = (err as NodeJS.ErrnoException).code === "ENOENT";
      reject(
        new Error(
          notInstalled
            ? "AI is unavailable: the 'claude' command isn't installed on this computer. " +
              "Install it and sign in to use transcription, grading and reports — everything else works without it."
            : `AI is unavailable: could not start the 'claude' command (${err.message}).`
        )
      );
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        // Some CLI errors (e.g. auth failures) are printed on stdout rather than stderr,
        // so surface whichever stream has content.
        const detail = stderr.trim() || stdout.trim() || "(no output)";
        // Auth/login problems are the common case on a fresh machine — give a clear fix.
        const isAuth = /login|log ?in|auth|oauth|unauthor|credential|session|sign ?in/i.test(detail);
        reject(
          new Error(
            isAuth
              ? "AI is unavailable: the 'claude' command isn't signed in on this computer. " +
                "Open Terminal, run `claude`, and log in once — then try again. Everything else works without it."
              : `AI is unavailable: the 'claude' command failed (exit ${code}). Details: ${detail}`
          )
        );
        return;
      }
      resolve(stdout);
    });

    child.stdin.write(fullPrompt);
    child.stdin.end();
  });

  // 4. Save the response and update the ai_requests row.
  fs.writeFileSync(responseFile, response, "utf-8");
  updateAiRequestResponse(aiRequest.id, responseFile);

  return response;
}
