"use client";

import { useActionState } from "react";
import { deleteSubmissionAction, type DeleteSubmissionState } from "../actions";

const initialState: DeleteSubmissionState = { error: null };

export function DeleteSubmissionButton({
  submissionId,
  filename,
}: {
  submissionId: number;
  filename: string;
}) {
  const [state, formAction, pending] = useActionState(deleteSubmissionAction, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Delete "${filename}" for good? This removes the scan and any transcript, grading, and report for it. This cannot be undone.`
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="submissionId" value={submissionId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
