"use client";

import { useActionState } from "react";
import { proposeAnswerKeyAction, type ProposeKeyState } from "@/lib/assessment/actions";

const initialState: ProposeKeyState = { error: null };

/**
 * Asks the app to draft the answer key from the blank test (and the uploaded
 * key, if there is one) into the per-question boxes below, for approval.
 */
export function ProposeKey({
  assessmentId,
  hasPaper,
  questionCount,
}: {
  assessmentId: number;
  hasPaper: boolean;
  questionCount: number;
}) {
  const [state, formAction, pending] = useActionState(proposeAnswerKeyAction, initialState);
  const blocked = !hasPaper
    ? "Upload the blank test paper (above, under Questions) first."
    : questionCount === 0
      ? "Add the questions first."
      : null;

  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-900">Propose the answer key</h3>
      <p className="mt-1 text-sm text-slate-600">
        The app works through the blank test and writes a solution with its mark split under each
        question below. If you uploaded your own key, that is treated as the authority and only
        organised per question. Read and edit each one — nothing is graded until you have.
      </p>
      <form action={formAction} className="mt-3 flex flex-wrap items-center gap-3">
        <input type="hidden" name="assessmentId" value={assessmentId} />
        <button
          type="submit"
          disabled={pending || blocked !== null}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {pending ? "Working through the paper…" : "Propose answer key"}
        </button>
        {blocked && <span className="text-xs text-slate-500">{blocked}</span>}
      </form>
      {pending && (
        <p className="mt-2 text-xs text-slate-500">
          Reading the paper and solving every question — this takes a minute or two.
        </p>
      )}
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state.result && (
        <p className="mt-2 text-sm text-emerald-700">
          Proposed solutions for {state.result.proposed} question
          {state.result.proposed === 1 ? "" : "s"}
          {state.result.fromTeacherKey ? " from your key" : ""}
          {state.result.usedVision ? " (the scan was read with AI vision)" : ""}.
          {state.result.uncovered.length > 0 &&
            ` Not covered: ${state.result.uncovered.join(", ")} — write those by hand.`}{" "}
          Check each one below before grading.
        </p>
      )}
    </div>
  );
}
