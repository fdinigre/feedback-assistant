// Every quote in a draft feedback that can be pointed at on the paper, each with a
// stable id that the draft viewer and the feedback panel share: clicking a highlight
// finds the note with the same id, and a note's "p. N" button finds its highlight.
// Pure (no mupdf, no DB): the browser uses it to decide what to show from the
// feedback as it is being edited; the server uses it to know what to locate.

import type { IaChecklistStatus, IaDraftFeedback } from "@/lib/types";

export type TargetCategory = "A" | "B" | "C" | "D" | "E" | "M";
export type FeedbackTarget = {
  id: string; // "ev-A-0" | "ck-A3.1" | "math-2"
  category: TargetCategory;
  quote: string;
  location: string;
  visible: boolean; // shown with the current edits (a dismissed finding or a "not evident" item is not)
  label: string; // short text for the highlight's tooltip
};

/** Highlighter colours, shared by the on-screen viewer and the annotated PDF. They differ in lightness as well as hue. */
export const CATEGORY_STYLE: Record<TargetCategory, { rgb: [number, number, number]; hex: string; name: string }> = {
  A: { rgb: [0.58, 0.77, 0.99], hex: "#93C5FD", name: "Presentation" },
  B: { rgb: [0.77, 0.71, 0.99], hex: "#C4B5FD", name: "Mathematical communication" },
  C: { rgb: [0.53, 0.94, 0.67], hex: "#86EFAC", name: "Personal engagement" },
  D: { rgb: [0.99, 0.9, 0.54], hex: "#FDE68A", name: "Reflection" },
  E: { rgb: [0.99, 0.73, 0.45], hex: "#FDBA74", name: "Use of mathematics" },
  M: { rgb: [0.97, 0.44, 0.44], hex: "#F87171", name: "Check the mathematics" },
};

export const evidenceId = (criterion: string, i: number) => `ev-${criterion}-${i}`;
export const checklistId = (itemId: string) => `ck-${itemId}`;
export const mathId = (i: number) => `math-${i}`;
/** The DOM id of the note for a target. */
export const noteDomId = (targetId: string) => `fb-${targetId}`;

export function feedbackTargets(fb: IaDraftFeedback | null | undefined): FeedbackTarget[] {
  if (!fb) return [];
  const out: FeedbackTarget[] = [];
  for (const c of fb.criteria ?? []) {
    const cat = c.criterion as TargetCategory;
    (c.evidence ?? []).forEach((e, i) => {
      if (e.quote?.trim())
        out.push({ id: evidenceId(c.criterion, i), category: cat, quote: e.quote, location: e.location, visible: true, label: `${c.criterion} · ${e.why ?? "evidence"}` });
    });
    for (const m of c.checklist ?? []) {
      if (!m.quote?.trim()) continue;
      const status: IaChecklistStatus = m.teacherStatus ?? m.status ?? "not_evident";
      out.push({ id: checklistId(m.id), category: cat, quote: m.quote, location: m.location ?? "", visible: status !== "not_evident", label: `${m.id} · ${status === "partly" ? "partly" : "evident"}` });
    }
  }
  (fb.mathCheck?.findings ?? []).forEach((f, i) => {
    if (f.quote?.trim())
      out.push({ id: mathId(i), category: "M", quote: f.quote, location: f.location, visible: !f.dismissed, label: `Math · ${f.severity}` });
  });
  return out;
}
