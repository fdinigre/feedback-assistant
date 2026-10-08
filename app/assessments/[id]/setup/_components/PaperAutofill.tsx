"use client";

import { useActionState, useState } from "react";
import {
  uploadMypPaperAndExtract,
  type PaperExtractState,
} from "@/lib/assessment/actions";
import { tooLargeMessage } from "@/lib/assessment/upload-limits";

const initialState: PaperExtractState = { error: null };

export function PaperAutofill({ assessmentId }: { assessmentId: number }) {
  const [state, formAction, pending] = useActionState(uploadMypPaperAndExtract, initialState);
  const [tooLarge, setTooLarge] = useState<string | null>(null);

  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-900">Auto-fill from the test paper</h3>
      <p className="mt-1 text-sm text-slate-600">
        Upload the blank test paper (PDF or Word) and the app will propose the question list and
        learning targets for you to review and edit below — no markscheme or student work needed
        yet. Proposed questions are added to the list; you can change or delete any of them.
      </p>
      <form action={formAction} className="mt-3 flex flex-wrap items-center gap-3">
        <input type="hidden" name="assessmentId" value={assessmentId} />
        <input
          type="file"
          name="paper"
          accept=".pdf,.docx"
          required
          onChange={(e) => {
            const file = e.target.files?.[0];
            setTooLarge(file ? tooLargeMessage(file) : null);
          }}
          className="text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
        />
        <button
          type="submit"
          disabled={pending || tooLarge !== null}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {pending ? "Reading the paper…" : "Extract questions"}
        </button>
      </form>
      {pending && (
        <p className="mt-2 text-xs text-slate-500">
          This reads the paper with AI and can take up to a minute.
        </p>
      )}
      {tooLarge && <p className="mt-2 text-sm text-red-600">{tooLarge}</p>}
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state.error === null && state.added != null && (
        <div className="mt-2 text-sm text-emerald-700">
          <p>
            Added {state.added} question{state.added === 1 ? "" : "s"} below for review — check the
            marks, level bands, and learning targets, then adjust anything that&rsquo;s off.
          </p>
          {state.coverTargets && state.coverTargets.length > 0 && (
            <p className="mt-1 text-xs text-slate-600">
              Learning targets found on the cover: {state.coverTargets.join("; ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
