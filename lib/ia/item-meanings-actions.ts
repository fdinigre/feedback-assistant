"use server";

import { revalidatePath } from "next/cache";
import { setIaItemMeanings } from "@/lib/db/queries";

/**
 * Saves what checklist items mean to the teacher ({ "C2.4": "…" }; blank clears one).
 * They apply to every student, from the next draft feedback generated.
 */
export async function saveIaItemMeanings(changes: Record<string, string>): Promise<{ error: string | null }> {
  if (!changes || typeof changes !== "object") return { error: "Nothing to save." };
  setIaItemMeanings(changes);
  revalidatePath("/settings");
  revalidatePath("/ia", "layout");
  return { error: null };
}
