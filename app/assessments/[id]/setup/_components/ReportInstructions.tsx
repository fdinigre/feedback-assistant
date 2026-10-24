"use client";

import { useActionState, useState } from "react";
import { setReportInstructions } from "@/lib/assessment/actions";
import {
  REPORT_INSTRUCTIONS_MAX_LENGTH,
  STANDARD_RULES_SUMMARY,
  type ReportInstructionsMode,
} from "@/lib/report/instructions";

/**
 * Optional instructions for how this assessment's reports are written: added to the
 * standard instructions, or in place of them. Left empty, the standard ones apply.
 */
export function ReportInstructions({
  assessmentId,
  text,
  mode,
}: {
  assessmentId: number;
  text: string | null;
  mode: ReportInstructionsMode;
}) {
  const [value, setValue] = useState(text ?? "");
  const [chosen, setChosen] = useState<ReportInstructionsMode>(mode);
  // Says what a click did: "Saving…", then "Saved ✓" until something changes again.
  const [dirty, setDirty] = useState(false);
  const [state, action, pending] = useActionState<{ saved: boolean; error: string | null }, FormData>(
    async (_prev, formData) => {
      try {
        await setReportInstructions(assessmentId, formData);
        setDirty(false);
        return { saved: true, error: null };
      } catch (err) {
        return { saved: false, error: (err as Error).message || "Couldn't save — try again." };
      }
    },
    { saved: false, error: null }
  );

  return (
    <form action={action} className="mt-3 space-y-3">
      <textarea
        name="report_instructions"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setDirty(true);
        }}
        rows={5}
        maxLength={REPORT_INSTRUCTIONS_MAX_LENGTH}
        placeholder="e.g. This was a group investigation: comment on how well the reasoning is communicated, keep the feedback comment under 60 words, and do not mention marks."
        className="w-full rounded border border-slate-300 p-2 text-sm"
      />
      <fieldset className="space-y-1.5 text-sm text-slate-700">
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="report_instructions_mode"
            value="add"
            checked={chosen === "add"}
            onChange={() => {
              setChosen("add");
              setDirty(true);
            }}
            className="mt-1"
          />
          <span>
            <span className="font-medium">Add to the standard instructions.</span> Everything below still
            applies; where yours disagree, yours win.
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="report_instructions_mode"
            value="replace"
            checked={chosen === "replace"}
            onChange={() => {
              setChosen("replace");
              setDirty(true);
            }}
            className="mt-1"
          />
          <span>
            <span className="font-medium">Replace the standard instructions.</span> Only yours are used for
            the style, length and structure of the report. Names stay hidden, nothing is invented, and the
            gem prompt and ATL focus are still written.
          </span>
        </label>
      </fieldset>
      <details className="text-xs text-slate-600">
        <summary className="cursor-pointer font-medium">What the standard instructions do</summary>
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          {STANDARD_RULES_SUMMARY.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save instructions"}
        </button>
        {!pending && state.saved && !dirty && <span className="text-xs text-emerald-700">Saved ✓</span>}
        {!pending && dirty && <span className="text-xs text-slate-500">Not saved yet</span>}
        {!pending && state.error && <span className="text-xs text-red-600">{state.error}</span>}
        <span className="text-xs text-slate-500">
          Don&apos;t type student names. Applies to reports you generate from now on; reports already
          written are not changed. Leave it empty (and save) to go back to the standard instructions.
        </span>
      </div>
    </form>
  );
}
