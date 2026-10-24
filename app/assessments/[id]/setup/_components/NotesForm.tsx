"use client";

import { useActionState, useState } from "react";

type SaveState = { saved: boolean; error: string | null };

/**
 * A notes box with its Save button, saying what happened: "Saving…", then
 * "Saved ✓" until the text changes again. The plain form gave no sign at all,
 * so a click looked like it had done nothing.
 */
export function NotesForm({
  action,
  defaultValue,
  rows,
  placeholder,
  label = "Save",
  primary = false,
}: {
  /** The server action that stores the box's text (sent as "content"). */
  action: (formData: FormData) => Promise<void>;
  defaultValue: string;
  rows: number;
  placeholder?: string;
  label?: string;
  /** The page's main save button, drawn dark; the others are outlined. */
  primary?: boolean;
}) {
  const [dirty, setDirty] = useState(false);
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    async (_prev, formData) => {
      try {
        await action(formData);
        setDirty(false);
        return { saved: true, error: null };
      } catch (err) {
        return { saved: false, error: (err as Error).message || "Couldn't save — try again." };
      }
    },
    { saved: false, error: null }
  );

  return (
    <form action={formAction} className="space-y-1">
      <textarea
        name="content"
        defaultValue={defaultValue}
        rows={rows}
        placeholder={placeholder}
        onChange={() => setDirty(true)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={
            primary
              ? "rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              : "rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
          }
        >
          {pending ? "Saving…" : label}
        </button>
        {!pending && state.saved && !dirty && <span className="text-xs text-emerald-700">Saved ✓</span>}
        {!pending && dirty && <span className="text-xs text-slate-500">Not saved yet</span>}
        {!pending && state.error && <span className="text-xs text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
