"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveAssessmentCriteria, type CriteriaState } from "@/lib/assessment/actions";
import { ALL_CRITERIA } from "@/lib/assessment/criteria";
import type { Criterion } from "@/lib/types";

const initialState: CriteriaState = { error: null };

const NAMES: Record<Criterion, string> = {
  A: "Knowing and understanding",
  B: "Investigating patterns",
  C: "Communicating",
  D: "Applying mathematics in real-life contexts",
};

/**
 * The criteria the assessment assesses, for when one was missed at creation. A
 * criterion with levels already given stays ticked: taking it away would drop them.
 */
export function CriteriaEditor({
  assessmentId,
  criteria,
  gradedCounts,
}: {
  assessmentId: number;
  criteria: Criterion[];
  /** Papers with a level for each criterion; one with any cannot be taken away. */
  gradedCounts: Partial<Record<Criterion, number>>;
}) {
  const [state, formAction, pending] = useActionState(
    saveAssessmentCriteria.bind(null, assessmentId),
    initialState
  );

  return (
    <form action={formAction} className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {ALL_CRITERIA.map((c) => {
          const graded = gradedCounts[c] ?? 0;
          const locked = criteria.includes(c) && graded > 0;
          return (
            <label
              key={c}
              className="flex items-center gap-1.5 text-sm text-slate-800"
              title={locked ? `Already graded for ${graded} paper${graded === 1 ? "" : "s"}` : NAMES[c]}
            >
              <input
                type="checkbox"
                name={`criterion_${c}`}
                defaultChecked={criteria.includes(c)}
                disabled={locked}
                className="h-4 w-4"
              />
              {/* A disabled box is not sent; this keeps a graded criterion on. */}
              {locked && <input type="hidden" name={`criterion_${c}`} value="on" />}
              <span className="font-medium">{c}</span>
              <span className="text-xs text-slate-500">{NAMES[c]}</span>
            </label>
          );
        })}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save criteria"}
        </button>
      </div>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      {state.saved && (
        <p className="text-xs text-emerald-700">
          Saved.
          {state.added && state.added.filter((c) => c !== "A").length > 0 && (
            <>
              {" "}
              {state.added.filter((c) => c !== "A").map((c) => `Criterion ${c}`).join(" and ")}: read
              its descriptors below, then give papers already graded their level from the{" "}
              <Link href={`/assessments/${assessmentId}/submissions`} className="underline underline-offset-2">
                submissions page
              </Link>{" "}
              — their marks are not graded again.
            </>
          )}
          {state.added?.includes("A") &&
            " Criterion A: set its thresholds and each question's band below, then grade the papers again to work it out."}
        </p>
      )}
    </form>
  );
}
