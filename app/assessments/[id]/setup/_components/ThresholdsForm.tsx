"use client";

import { useActionState } from "react";
import { saveThresholds, type FormState } from "@/lib/assessment/actions";
import type { LevelThresholdRow } from "@/lib/types";

const initialState: FormState = { error: null };

export function ThresholdsForm({
  assessmentId,
  thresholds,
}: {
  assessmentId: number;
  thresholds: LevelThresholdRow[];
}) {
  const boundAction = saveThresholds.bind(null, assessmentId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const byLevel = new Map(thresholds.map((t) => [t.level, t.min_points]));

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => i + 1).map((level) => (
          <div key={level}>
            <label className="block text-xs font-medium text-slate-600">Level {level}</label>
            <input
              type="number"
              step="0.5"
              min="0"
              name={`level_${level}`}
              defaultValue={byLevel.get(level) ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Minimum marks to reach each level, scored <strong>within each band pair</strong> (1-2, 3-4,
        5-6, 7-8) from that band&rsquo;s own questions. Marks reset between bands, so a higher band
        can need fewer marks than a lower one (e.g. level 5 at 4 pts even though level 4 needed 6).
        A student who reaches a higher band while missing an earlier one drops one level per band
        missed.
      </p>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save thresholds"}
      </button>
    </form>
  );
}
