"use client";

import { useActionState } from "react";
import {
  proposeRubricDescriptorsAction,
  type ProposeDescriptorsState,
} from "@/lib/assessment/actions";

const initialState: ProposeDescriptorsState = { error: null };

/**
 * Reads the achievement-level tables off what is already on file — the task
 * documents, or the task paper on an assessment set up before those existed. The
 * task normally prints the rubric the students were given, so the descriptors do
 * not have to be retyped — they land in the editor below for review.
 */
export function ProposeDescriptors({
  assessmentId,
  source,
}: {
  assessmentId: number;
  /** Where the tables would be read from, or null when nothing is uploaded yet. */
  source: "documents" | "paper" | null;
}) {
  const [state, formAction, pending] = useActionState(
    proposeRubricDescriptorsAction.bind(null, assessmentId),
    initialState
  );

  return (
    <form action={formAction} className="mt-2">
      <button
        type="submit"
        disabled={pending || source === null}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
      >
        {pending
          ? "Reading…"
          : source === "paper"
            ? "Read descriptors from the paper"
            : "Read descriptors from the task documents"}
      </button>
      {source === null && (
        <span className="ml-2 text-xs text-slate-500">Upload the task documents first (above).</span>
      )}
      {pending && <p className="mt-1 text-xs text-slate-500">Reading the task — this takes a minute or so.</p>}
      {state.error && <p className="mt-1 text-xs text-red-600">{state.error}</p>}
      {state.results?.map((r) => (
        <p key={r.criterion} className="mt-1 text-xs text-emerald-700">
          Read {r.added} statement{r.added === 1 ? "" : "s"} into Criterion {r.criterion} — check them
          below before grading.
        </p>
      ))}
      {state.notes?.map((n) => (
        <p key={n} className="mt-1 text-xs text-amber-700">
          {n}
        </p>
      ))}
    </form>
  );
}
