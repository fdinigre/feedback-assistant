"use client";

import { useActionState } from "react";
import {
  proposeRubricDescriptorsAction,
  type ProposeDescriptorsState,
} from "@/lib/assessment/actions";

const initialState: ProposeDescriptorsState = { error: null };

/**
 * Reads the achievement-level table off the task paper already on file. The task
 * normally prints the rubric the students were given, so the descriptors do not
 * have to be retyped — they land in the editor below for review.
 */
export function ProposeDescriptors({
  assessmentId,
  hasPaper,
}: {
  assessmentId: number;
  hasPaper: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    proposeRubricDescriptorsAction.bind(null, assessmentId),
    initialState
  );

  return (
    <form action={formAction} className="mt-2">
      <button
        type="submit"
        disabled={pending || !hasPaper}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "Reading the paper…" : "Read descriptors from the paper"}
      </button>
      {!hasPaper && (
        <span className="ml-2 text-xs text-slate-500">
          Upload the task paper first (above, under Questions).
        </span>
      )}
      {pending && (
        <p className="mt-1 text-xs text-slate-500">
          Reading the task — this takes a minute or so.
        </p>
      )}
      {state.error && <p className="mt-1 text-xs text-red-600">{state.error}</p>}
      {state.result && (
        <p className="mt-1 text-xs text-emerald-700">
          Read {state.result.added} statement{state.result.added === 1 ? "" : "s"} into Criterion{" "}
          {state.result.criterion} — check them below before grading.
        </p>
      )}
    </form>
  );
}
