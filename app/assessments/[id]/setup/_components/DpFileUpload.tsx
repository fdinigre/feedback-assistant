"use client";

import { useActionState, useState } from "react";
import type { DpFormState } from "../actions";
import { tooLargeMessage } from "@/lib/assessment/upload-limits";

const initialState: DpFormState = { error: null };

export function DpFileUpload({
  label,
  hint,
  currentPath,
  action,
}: {
  label: string;
  hint: string;
  currentPath: string | null;
  action: (prev: DpFormState, formData: FormData) => Promise<DpFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [tooLarge, setTooLarge] = useState<string | null>(null);

  const currentName = currentPath ? currentPath.split("/").pop() : null;

  return (
    <form action={formAction} className="rounded-md border border-slate-200 p-4">
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
      {currentName && (
        <p className="mt-2 text-sm text-emerald-700">Currently uploaded: {currentName}</p>
      )}
      <div className="mt-3 flex items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".pdf,.docx"
          required
          onChange={(e) => {
            const file = e.target.files?.[0];
            setTooLarge(file ? tooLargeMessage(file) : null);
          }}
          className="text-sm text-slate-700"
        />
        <button
          type="submit"
          disabled={pending || tooLarge !== null}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "Uploading…" : currentName ? "Replace" : "Upload"}
        </button>
      </div>
      {tooLarge && <p className="mt-2 text-sm text-red-600">{tooLarge}</p>}
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
