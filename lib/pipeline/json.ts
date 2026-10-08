// Robust JSON extraction for LLM responses.
//
// This module is intentionally PURE (no "server-only", no DB/AI imports) so it
// can be unit-tested standalone via `npx tsx scripts/test-pipeline-parse.mts`,
// which runs outside Next's bundler where the server-only guard would throw.
//
// Models wrap JSON in prose, ```json fences, or trailing commentary. We locate
// the first balanced JSON value (object or array), respecting string literals
// and escapes, and return exactly that substring.

/** Finds the index of the first `{` or `[` in text, or -1. */
function firstBracketIndex(text: string): number {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{" || text[i] === "[") return i;
  }
  return -1;
}

/**
 * Extracts the first balanced JSON object/array substring from arbitrary text.
 * Prefers the contents of a fenced ```json block if one is present.
 * Throws if no balanced JSON value can be found.
 */
export function extractFirstJson(raw: string): string {
  // Prefer a fenced block, which is where CLIs most reliably place JSON.
  const fence = raw.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  const text = fence ? fence[1] : raw;

  const start = firstBracketIndex(text);
  if (start === -1) {
    throw new Error("extractFirstJson: no '{' or '[' found in text");
  }

  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (c === "\\") {
        escaped = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === open) {
      depth++;
    } else if (c === close) {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  throw new Error("extractFirstJson: unterminated JSON value (no matching close bracket)");
}

/** Extracts and parses the first balanced JSON value from arbitrary text. */
export function parseJson<T>(raw: string): T {
  const slice = extractFirstJson(raw);
  return JSON.parse(slice) as T;
}
