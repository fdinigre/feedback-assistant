"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import {
  deleteStyleExample,
  getAiRequest,
  insertStyleExample,
  listStyleExamples,
  setAppSetting,
} from "@/lib/db/queries";
import { getForbiddenNames, scrubOutput } from "@/lib/pipeline/guards";
import { EFFORT_SETTING_KEY, parseEffort, type EffortKind } from "@/lib/ai/effort";
import { AI_PROVIDER_SETTING, parseAiProvider } from "@/lib/ai/provider";
import { claudeAccountStatus } from "@/lib/ai/claude";
import { geminiAccountStatus, type AccountStatus } from "@/lib/ai/gemini";

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

/** Saves how hard Gemini thinks for one kind of work (see lib/ai/effort.ts). */
export async function saveEffortAction(kind: EffortKind, value: string): Promise<{ error: string | null }> {
  const effort = parseEffort(value);
  if (!effort || !(kind in EFFORT_SETTING_KEY)) return { error: "That isn't an effort level." };
  setAppSetting(EFFORT_SETTING_KEY[kind], effort);
  revalidatePath("/settings");
  return { error: null };
}

// ---------------------------------------------------------------------------
// Which AI marks — the switch in Settings → AI
// ---------------------------------------------------------------------------

/** Takes effect on the next AI request; nothing has to restart. */
export async function saveAiProviderAction(value: string): Promise<{ error: string | null }> {
  const provider = parseAiProvider(value);
  if (!provider) return { error: "That isn't one of the AIs the app can use." };
  setAppSetting(AI_PROVIDER_SETTING, provider);
  revalidatePath("/settings");
  return { error: null };
}

/**
 * Who each AI is signed in as. Asked for after the page has loaded: Gemini's
 * answer means signing in, which takes a few seconds, and neither sends a prompt.
 */
export async function aiAccountsAction(): Promise<{ gemini: AccountStatus; claude: AccountStatus }> {
  const [gemini, claude] = await Promise.all([geminiAccountStatus(), claudeAccountStatus()]);
  return { gemini, claude };
}
