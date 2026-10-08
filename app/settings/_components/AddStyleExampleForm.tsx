"use client";

import { useActionState } from "react";
import { addStyleExampleAction, type StyleExampleFormState } from "../actions";

const initialState: StyleExampleFormState = { error: null };

export function AddStyleExampleForm() {
  const [state, formAction, pending] = useActionState(addStyleExampleAction, initialState);

  return (
    <form action={formAction} className="mt-2 space-y-2">
      <textarea
        name="content"
        required
        rows={4}
        placeholder="Paste a real Toddle comment you've written…"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add example"}
      </button>
    </form>
  );
}
