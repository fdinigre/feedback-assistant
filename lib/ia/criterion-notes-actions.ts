"use server";

import { revalidatePath } from "next/cache";
import { setIaCriterionNotes } from "@/lib/db/queries";
import { IA_NOTE_KEYS, type IaCriterionNotes } from "@/lib/ia/criterion-notes";

/**
 * Saves the IB-guide notes for each Exploration criterion. Applies from the next IA
 * feedback or marks generation. A note left blank, or put back to the guide's wording,
 * falls back to the default.
 */
export async function saveIaCriterionNotes(
  notes: Partial<IaCriterionNotes>
): Promise<{ error: string | null }> {
  const clean: Partial<IaCriterionNotes> = {};
  for (const k of IA_NOTE_KEYS) {
    const v = notes[k];
    if (typeof v === "string") clean[k] = v;
  }
  setIaCriterionNotes(clean);
  revalidatePath("/settings");
  return { error: null };
}
