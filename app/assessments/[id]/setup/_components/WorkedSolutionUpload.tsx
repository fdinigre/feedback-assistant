"use client";

import { useActionState, useState } from "react";
import {
  uploadMypWorkedSolutions,
  type WorkedUploadState,
} from "@/lib/assessment/actions";
import { tooLargeMessage } from "@/lib/assessment/upload-limits";

const initialState: WorkedUploadState = { error: null };

export function WorkedSolutionUpload({ assessmentId }: { assessmentId: number }) {
  const [state, formAction, pending] = useActionState(uploadMypWorkedSolutions, initialState);
  const [tooLarge, setTooLarge] = useState<string | null>(null);

  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-900">Upload worked solutions / markscheme</h3>
      <p className="mt-1 text-sm text-slate-600">
        Upload the worked-solutions or markscheme file. A <strong>PDF</strong> is read with AI vision
        — so handwritten keys, mark boxes, and coordinate diagrams come through (takes about a
        minute; needs you logged in to Claude). A <strong>Word (.docx)</strong> file is read locally
        as text. The result lands in the worked-solution box below for you to review and edit.
      </p>
      <form action={formAction} className="mt-3 flex flex-wrap items-center gap-3">
        <input type="hidden" name="assessmentId" value={assessmentId} />
        <input
          type="file"
          name="worked"
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
          {pending ? "Reading…" : "Upload & extract"}
        </button>
      </form>
      {pending && (
        <p className="mt-2 text-xs text-slate-500">
          Reading the pages with AI — this can take up to a minute for a handwritten key.
        </p>
      )}
      {tooLarge && <p className="mt-2 text-sm text-red-600">{tooLarge}</p>}
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state.error === null && state.chars != null && (
        <p className="mt-2 text-sm text-emerald-700">
          {state.usedVision ? "Read the pages with AI vision" : "Extracted the text"} into the
          worked-solution box below ({state.chars.toLocaleString()} characters) — review it and fix
          anything that came through wrong.
        </p>
      )}
    </div>
  );
}
