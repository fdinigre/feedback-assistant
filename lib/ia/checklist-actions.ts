"use server";

import { revalidatePath } from "next/cache";
import { setIaChecklist } from "@/lib/db/queries";

/**
 * Saves the teacher's personal IA checklist. It is fed into both the draft-feedback
 * and final-marking prompts alongside the official rubric, and applies from the next
 * generation onward.
 */
export async function saveIaChecklist(text: string): Promise<{ error: string | null }> {
  setIaChecklist(text.trim());
  revalidatePath("/settings");
  return { error: null };
}
