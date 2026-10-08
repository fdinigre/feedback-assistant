"use client";

import { useActionState } from "react";
import type { GradeBoundary } from "@/lib/types";
import { saveDpBoundaries, type DpFormState } from "../actions";

const initialState: DpFormState = { error: null };

export function DpBoundariesForm({
  assessmentId,
  boundaries,
  defaults,
}: {
  assessmentId: number;
  boundaries: GradeBoundary[] | null;
  defaults: GradeBoundary[] | null;
}) {
  const action = saveDpBoundaries.bind(null, assessmentId);
  const [state, formAction, pending] = useActionState(action, initialState);

  const initial = boundaries ?? defaults;
  const byGrade = new Map((initial ?? []).map((b) => [b.grade, b.minPct]));

  return (
    <form action={formAction} className="mt-4 space-y-3">
      {!boundaries && defaults && (
        <p className="text-xs text-slate-500">
          Pre-filled from the most recent DP assessment with a boundary table — adjust as needed.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => i + 1).map((grade) => (
          <div key={grade}>
            <label className="block text-xs font-medium text-slate-600">Grade {grade}</label>
            <div className="mt-1 flex items-center gap-1">
              <input
                type="number"
                name={`grade_${grade}`}
                step="0.1"
                min="0"
                max="100"
                defaultValue={byGrade.get(grade) ?? ""}
                required
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
              <span className="text-xs text-slate-500">%</span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Each value is the inclusive floor (minimum %) for that grade. Grade 1 must start at 0%,
        and floors must strictly increase.
      </p>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save boundaries"}
      </button>
    </form>
  );
}
