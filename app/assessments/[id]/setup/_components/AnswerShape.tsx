"use client";

import { useActionState } from "react";
import {
  addWholeWorkItem,
  readQuestionsFromTaskSheet,
  type PaperExtractState,
} from "@/lib/assessment/actions";

const initialState: PaperExtractState = { error: null };

/**
 * A B/C/D task with nothing in its question list yet is one of two shapes: one
 * piece handed in whole (a report), or parts answered on the task sheet. Asked
 * here rather than assumed, because the grader reads the work one item at a time.
 */
export function AnswerShape({
  assessmentId,
  hasTaskSheet,
}: {
  assessmentId: number;
  hasTaskSheet: boolean;
}) {
  const [state, readAction, pending] = useActionState(
    readQuestionsFromTaskSheet.bind(null, assessmentId),
    initialState
  );

  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-medium text-slate-800">How do the students answer this task?</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <form action={addWholeWorkItem.bind(null, assessmentId)} className="space-y-2">
          <p className="text-sm font-medium text-slate-900">As one piece of work</p>
          <p className="text-xs text-slate-600">
            A report or similar, handed in whole. It is read and judged as one, against the
            descriptors and the task documents.
          </p>
          <div className="flex items-center gap-2">
            <input
              name="label"
              defaultValue="Report"
              aria-label="What to call it"
              className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
            >
              Mark it as one piece
            </button>
          </div>
        </form>
        <form action={readAction} className="space-y-2">
          <p className="text-sm font-medium text-slate-900">Part by part, on the task sheet</p>
          <p className="text-xs text-slate-600">
            Numbered parts the students answer on the sheet itself. They are read off the task
            sheet like a blank test, and the sheet becomes the paper the name mask is placed on.
          </p>
          <button
            type="submit"
            disabled={pending || !hasTaskSheet}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            {pending ? "Reading the task sheet…" : "Read the parts from the task sheet"}
          </button>
          {!hasTaskSheet && (
            <p className="text-xs text-slate-500">Label one of the task documents as the task sheet first.</p>
          )}
          {state.error && <p className="text-xs text-red-600">{state.error}</p>}
          {state.error === null && state.added != null && (
            <p className="text-xs text-emerald-700">
              Added {state.added} part{state.added === 1 ? "" : "s"} below — check them.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
