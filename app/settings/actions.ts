"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import {
  deleteStyleExample,
  getAiRequest,
  insertStyleExample,
  listStyleExamples,
} from "@/lib/db/queries";
import { getForbiddenNames, scrubOutput } from "@/lib/pipeline/guards";

export type StyleExampleFormState = { error: string | null };

export async function addStyleExampleAction(
  _prevState: StyleExampleFormState,
  formData: FormData
): Promise<StyleExampleFormState> {
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return { error: "Example text is required." };

  // A pasted comment usually opens with the student's name. Left in, a name on
  // the current roster would make the privacy guard refuse every report that
  // carries this example, so it is swapped for the placeholder here instead.
  const { text } = scrubOutput(content, getForbiddenNames());
  insertStyleExample({ kind: "comment", content: text });
  revalidatePath("/settings");
  return { error: null };
}

export async function deleteStyleExampleAction(
  _prevState: StyleExampleFormState,
  formData: FormData
): Promise<StyleExampleFormState> {
  const id = Number(formData.get("id"));
  const existing = listStyleExamples().find((e) => e.id === id);
  if (!existing) return { error: "Example not found." };
  if (existing.kind !== "comment") {
    return { error: "Only comment-style examples can be deleted here." };
  }

  deleteStyleExample(id);
  revalidatePath("/settings");
  return { error: null };
}

// ---------------------------------------------------------------------------
// AI request log — prompt viewer. Reads the logged prompt file straight off
// disk so the "student names never appear in prompts" claim is inspectable,
// not just asserted.
// ---------------------------------------------------------------------------

const AI_LOG_DIR = path.join(process.cwd(), "data", "ai-log");
const MAX_PROMPT_CHARS = 200_000;

export type PromptFileResult = { content: string } | { error: string };

export async function readAiRequestPrompt(id: number): Promise<PromptFileResult> {
  const request = getAiRequest(id);
  if (!request) return { error: "AI request not found." };

  const resolved = path.resolve(request.prompt_file);
  if (resolved !== AI_LOG_DIR && !resolved.startsWith(AI_LOG_DIR + path.sep)) {
    return { error: "Prompt file is outside the expected log directory." };
  }

  try {
    const raw = await fs.readFile(resolved, "utf-8");
    const content =
      raw.length > MAX_PROMPT_CHARS
        ? `${raw.slice(0, MAX_PROMPT_CHARS)}\n…[truncated]`
        : raw;
    return { content };
  } catch {
    return { error: "Could not read the prompt file — it may have been moved or deleted." };
  }
}
