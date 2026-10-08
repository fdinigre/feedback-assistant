"use client";

import { useActionState } from "react";
import { deleteClassAction, type ClassFormState } from "../actions";

const initialState: ClassFormState = { error: null };

export function DeleteClassButton({
  classId,
  className,
  footprint,
}: {
  classId: number;
  className: string;
  footprint: { students: number; submissions: number; reports: number };
}) {
  const [state, formAction, pending] = useActionState(deleteClassAction, initialState);

  // Spell out exactly what the cascade will remove so the teacher can decide knowingly.
  const parts: string[] = [];
  if (footprint.students > 0)
    parts.push(`${footprint.students} student${footprint.students === 1 ? "" : "s"}`);
  if (footprint.submissions > 0)
    parts.push(`${footprint.submissions} submission${footprint.submissions === 1 ? "" : "s"}`);
  if (footprint.reports > 0)
    parts.push(`${footprint.reports} report${footprint.reports === 1 ? "" : "s"}`);
  const consequence =
    parts.length > 0
      ? `This will permanently delete ${className} and everything under it: ${parts.join(
          ", "
        )}. This cannot be undone.`
      : `Delete ${className}? This cannot be undone.`;

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(consequence)) {
          e.preventDefault();
        }
      }}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="id" value={classId} />
      <button
        type="submit"
        disabled={pending}
        className="text-sm font-medium text-red-600 hover:text-red-800 disabled:cursor-not-allowed disabled:text-slate-300"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
