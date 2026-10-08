"use client";

import { useActionState } from "react";
import { deleteAssessmentAction, type DeleteAssessmentState } from "@/lib/assessment/actions";

const initialState: DeleteAssessmentState = { error: null };

export function DeleteAssessmentButton({
  assessmentId,
  title,
  submissions,
}: {
  assessmentId: number;
  title: string;
  submissions: number;
}) {
  const [state, formAction, pending] = useActionState(deleteAssessmentAction, initialState);

  const consequence =
    submissions > 0
      ? `This will permanently delete "${title}" with its questions, answer key and ${submissions} submission${
          submissions === 1 ? "" : "s"
        } (scans, marks and reports). Students stay in their class. This cannot be undone.`
      : `Delete "${title}" with its questions and answer key? This cannot be undone.`;

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(consequence)) e.preventDefault();
      }}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="id" value={assessmentId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300"
      >
        {pending ? "Deleting…" : "Delete assessment"}
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
