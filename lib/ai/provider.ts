import "server-only";

import { runClaude, type RunClaudeOptions } from "@/lib/ai/claude";
import { runGemini } from "@/lib/ai/gemini";

// Single place the whole app asks "run this prompt through the AI". The backend
// is chosen by the MFA_AI_PROVIDER env var (default "claude"), so the same code
// runs on a teacher's Claude subscription OR on Gemini without touching any
// pipeline. The privacy guard, pseudonymization and page masking are identical
// either way — they run before this call, and each adapter re-checks the prompt
// before it leaves the machine.

export type AiProvider = "claude" | "gemini";
export type { RunClaudeOptions as RunAiOptions };

export function aiProvider(): AiProvider {
  return (process.env.MFA_AI_PROVIDER ?? "").trim().toLowerCase() === "gemini" ? "gemini" : "claude";
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
