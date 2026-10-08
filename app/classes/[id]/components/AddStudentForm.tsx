"use client";

import { useActionState } from "react";
import { addStudentAction, type StudentFormState } from "../actions";

const initialState: StudentFormState = { error: null };

export function AddStudentForm({ classId }: { classId: number }) {
  const boundAction = addStudentAction.bind(null, classId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="flex items-end gap-2">
      <div className="flex-1">
        <label htmlFor="student-name" className="block text-sm font-medium text-slate-700">
          Full name
        </label>
        <input
          id="student-name"
          name="name"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="e.g. Jane Doe"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add"}
      </button>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
