import "server-only";

import { runClaude, type RunClaudeOptions } from "@/lib/ai/claude";
import { runGemini } from "@/lib/ai/gemini";
import { getAppSetting } from "@/lib/db/queries";

// Single place the whole app asks "run this prompt through the AI". The backend
// is the one chosen in Settings → AI, else the MFA_AI_PROVIDER env var the
// installer writes (default "claude"), so the same
// code runs on a teacher's Claude subscription OR on Gemini without touching any
// pipeline. The privacy guard, pseudonymization and page masking are identical
// either way — they run before this call, and each adapter re-checks the prompt
// before it leaves the machine.

export type AiProvider = "claude" | "gemini";
export type { RunClaudeOptions as RunAiOptions };

/** The app_settings key the Settings switch is stored under. */
export const AI_PROVIDER_SETTING = "ai_provider";

export function parseAiProvider(value: unknown): AiProvider | null {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return v === "gemini" || v === "claude" ? v : null;
}

/**
 * Read on every request, so switching in Settings takes effect on the next one
 * without restarting the app. Until a choice is made there, the installer's
 * setting stands — Gemini on a colleague's copy.
 */
export function aiProvider(): AiProvider {
  const chosen = parseAiProvider(getAppSetting(AI_PROVIDER_SETTING));
  return chosen ?? (parseAiProvider(process.env.MFA_AI_PROVIDER) === "gemini" ? "gemini" : "claude");
}

/**
 * `provider` pins one call to one backend, whatever the app is set to. A feature
 * that may only run through a particular account needs that guaranteed in code
 * rather than left to an environment variable someone can change.
 */
export async function runAi(
  opts: RunClaudeOptions & { provider?: AiProvider }
): Promise<string> {
  const backend = opts.provider ?? aiProvider();
  return backend === "gemini" ? runGemini(opts) : runClaude(opts);
}
