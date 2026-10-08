"use client";

import { useActionState } from "react";
import { deleteStyleExampleAction, type StyleExampleFormState } from "../actions";

const initialState: StyleExampleFormState = { error: null };

export function DeleteStyleExampleButton({ id }: { id: number }) {
  const [state, formAction, pending] = useActionState(deleteStyleExampleAction, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("Delete this style example? This cannot be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {state.error && <span className="ml-2 text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
