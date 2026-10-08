"use server";

import { revalidatePath } from "next/cache";
import {
  deleteMarkingInstruction,
  insertMarkingInstruction,
} from "@/lib/db/queries";
import type { Programme } from "@/lib/types";

export type MarkingNoteInput = {
  text: string;
  scope: "standing" | "assessment";
  programme?: Programme | null; // standing only; null = every programme
  assessmentId?: number | null; // assessment scope only
};

/** Adds a marking instruction. It applies from the next grading run onward. */
export async function addMarkingInstruction(
  input: MarkingNoteInput
): Promise<{ error: string | null }> {
  const text = input.text.trim();
  if (!text) return { error: "Write the instruction first." };
  if (input.scope === "assessment" && !input.assessmentId) {
    return { error: "This note needs an assessment." };
  }
  insertMarkingInstruction({
    scope: input.scope,
    programme: input.scope === "standing" ? input.programme ?? null : null,
    assessment_id: input.scope === "assessment" ? input.assessmentId ?? null : null,
    text,
  });
  revalidatePath("/settings");
  if (input.assessmentId) {
    revalidatePath(`/assessments/${input.assessmentId}/setup`);
  }
  return { error: null };
}

export async function deleteMarkingInstructionAction(id: number): Promise<void> {
  deleteMarkingInstruction(id);
  revalidatePath("/settings");
}
