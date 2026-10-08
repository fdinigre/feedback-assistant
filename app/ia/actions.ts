"use server";

import { revalidatePath } from "next/cache";
import {
  clearIaMilestone,
  findOrCreateIaExploration,
  setIaMilestoneComplete,
  updateIaExplorationTopic,
  upsertIaDeadline,
} from "@/lib/db/queries";
import { IA_MILESTONES, type IaMilestone } from "@/lib/types";

function isMilestone(value: string): value is IaMilestone {
  return (IA_MILESTONES as readonly string[]).includes(value);
}

/** Milestones toggled manually by the teacher; the rest are set automatically by upload/approve actions. */
const MANUAL_MILESTONES: IaMilestone[] = ["topic_proposed", "topic_approved"];

export async function saveDeadlinesAction(classId: number, formData: FormData): Promise<void> {
  for (const milestone of IA_MILESTONES) {
    const value = String(formData.get(`due_${milestone}`) ?? "").trim();
    if (value) {
      upsertIaDeadline({ class_id: classId, milestone, due_date: value });
    }
  }
  revalidatePath("/ia");
}

export async function saveTopicAction(studentId: number, formData: FormData): Promise<void> {
  const exploration = findOrCreateIaExploration(studentId);
  const topic = String(formData.get("topic") ?? "").trim();
  updateIaExplorationTopic(exploration.id, topic || null);
  revalidatePath(`/ia/${studentId}`);
  revalidatePath("/ia");
}

export async function toggleMilestoneAction(
  studentId: number,
  milestone: IaMilestone,
  formData: FormData
): Promise<void> {
  // Defensive guard: only the two manual milestones can be toggled here — the
  // rest are set automatically by upload/approve flows (spec P15).
  if (!MANUAL_MILESTONES.includes(milestone)) return;

  const exploration = findOrCreateIaExploration(studentId);
  const complete = formData.get("complete") === "true";
  if (complete) {
    setIaMilestoneComplete(exploration.id, milestone);
  } else {
    clearIaMilestone(exploration.id, milestone);
  }
  revalidatePath(`/ia/${studentId}`);
  revalidatePath("/ia");
}

export type BulkResult = { error: string | null; changed?: number };

/**
 * Applies one milestone to many students at once (e.g. select several and mark
 * "topic proposed"). `complete` true sets the milestone (dated now), false clears it.
 */
export async function bulkSetMilestoneAction(
  studentIds: number[],
  milestone: string,
  complete: boolean
): Promise<BulkResult> {
  if (!isMilestone(milestone)) return { error: "Unknown milestone." };
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return { error: "Select at least one student first." };
  }
  let changed = 0;
  for (const studentId of studentIds) {
    if (!Number.isInteger(studentId)) continue;
    const exploration = findOrCreateIaExploration(studentId);
    if (complete) setIaMilestoneComplete(exploration.id, milestone);
    else clearIaMilestone(exploration.id, milestone);
    changed++;
  }
  revalidatePath("/ia");
  return { error: null, changed };
}

/**
 * Saves topics for many students in one go — the table/paste flow, so the teacher
 * never has to open each student page. Empty strings clear the topic. Only entries
 * whose topic actually changed are written.
 */
export async function bulkSaveTopicsAction(
  entries: { studentId: number; topic: string }[]
): Promise<BulkResult> {
  if (!Array.isArray(entries)) return { error: "Nothing to save." };
  let changed = 0;
  for (const { studentId, topic } of entries) {
    if (!Number.isInteger(studentId)) continue;
    const exploration = findOrCreateIaExploration(studentId);
    updateIaExplorationTopic(exploration.id, topic.trim() || null);
    changed++;
  }
  revalidatePath("/ia");
  return { error: null, changed };
}
