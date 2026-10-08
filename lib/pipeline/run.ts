import "server-only";

import type { RunClaudeOptions } from "@/lib/ai/claude";
import { runAi } from "@/lib/ai/provider";
import { parseJson } from "@/lib/pipeline/json";

const JSON_REMINDER =
  "\n\nIMPORTANT: Your previous response could not be parsed as JSON. " +
  "Return ONLY the raw JSON value, with no prose, no explanation, and no ```code fences``` before or after it.";

/**
 * Runs a prompt through the CLI and parses the response as JSON matching T.
 * Robust parsing: extract the first balanced JSON value; on parse failure retry
 * ONCE with a "return only JSON" reminder appended; then fail loudly.
 *
 * The privacy guard lives inside runClaude (throws if a forbidden name is in the
 * prompt), so it is enforced on every call routed through here.
 */
export async function runClaudeJson<T>(opts: RunClaudeOptions): Promise<T> {
  const first = await runAi(opts);
  try {
    return parseJson<T>(first);
  } catch (firstErr) {
    const retry = await runAi({ ...opts, prompt: `${opts.prompt}${JSON_REMINDER}` });
    try {
      return parseJson<T>(retry);
    } catch (retryErr) {
      throw new Error(
        `runClaudeJson("${opts.purpose}"): failed to parse JSON after one retry. ` +
          `First error: ${(firstErr as Error).message}. Retry error: ${(retryErr as Error).message}. ` +
          `Raw retry response (truncated): ${retry.slice(0, 500)}`
      );
    }
  }
}
