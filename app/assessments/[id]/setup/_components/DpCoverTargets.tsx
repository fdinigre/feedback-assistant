"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { LearningTargetRow, QuestionRow } from "@/lib/types";
import { LearningTargetCombobox } from "./LearningTargetCombobox";
import {
  extractCoverTargetsAction,
  matchTargetsAction,
  saveCoverTargetsManual,
  setQuestionLearningTarget,
  type DpFormState,
} from "../actions";

const initialState: DpFormState = { error: null };

export function DpCoverTargets({
  assessmentId,
  coverTargets,
  questions,
  learningTargets,
  hasPaper,
}: {
  assessmentId: number;
  coverTargets: string[] | null;
  questions: QuestionRow[];
  learningTargets: LearningTargetRow[];
  hasPaper: boolean;
}) {
  const extractAction = extractCoverTargetsAction.bind(null, assessmentId);
  const [state, formAction, pending] = useActionState(extractAction, initialState);
  const router = useRouter();
  const matchAction = matchTargetsAction.bind(null, assessmentId);
  const [matchState, matchFormAction, matching] = useActionState(matchAction, initialState);
  // When a match run finishes without error, refresh so the mapping inputs show the
  // newly-applied targets instead of staying blank until a manual reload.
  useEffect(() => {
    if (!matching && matchState.error === null && matchState !== initialState) router.refresh();
  }, [matching, matchState, router]);
  const targetsById = new Map(learningTargets.map((t) => [t.id, t]));
  const hasTargets = (coverTargets?.length ?? 0) > 0;

  return (
    <div className="mt-4 space-y-4">
      <form action={formAction} className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !hasPaper}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "Extracting…" : "Extract targets from cover page"}
        </button>
        {!hasPaper && <span className="text-xs text-slate-500">Upload the exam paper first.</span>}
      </form>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      {coverTargets && coverTargets.length > 0 && (
        <ul className="list-inside list-disc rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
          {coverTargets.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}

      <details className="rounded-md border border-dashed border-slate-300 p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          Cover unreadable? Type the targets manually
        </summary>
        <form action={saveCoverTargetsManual.bind(null, assessmentId)} className="mt-2 space-y-2">
          <textarea
            name="targets"
            defaultValue={(coverTargets ?? []).join("\n")}
            rows={4}
            placeholder="One learning target per line"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
          >
            Save targets
          </button>
        </form>
      </details>

      {questions.length > 0 && (
        <div>
          <p className="text-sm font-medium text-slate-700">Question → target mapping</p>
          <p className="mt-1 text-xs text-slate-500">
            Proposed automatically where confident — confirm or adjust each one.
          </p>
          <form action={matchFormAction} className="mt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={matching || !hasTargets}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {matching ? "Matching…" : "Match targets to questions"}
            </button>
            {!hasTargets && (
              <span className="text-xs text-slate-500">Type or extract the targets first.</span>
            )}
          </form>
          {matchState.error && <p className="mt-1 text-sm text-red-600">{matchState.error}</p>}
          <div className="mt-2 space-y-2">
            {questions.map((q) => (
              <form
                key={`${q.id}-${q.learning_target_id ?? "none"}`}
                action={setQuestionLearningTarget.bind(null, assessmentId, q.id)}
                className="flex items-center gap-2"
              >
                <span className="w-16 text-sm text-slate-600">Q{q.number}</span>
                <div className="flex-1">
                  <LearningTargetCombobox
                    name="learning_target_name"
                    targets={learningTargets}
                    defaultValue={
                      q.learning_target_id ? targetsById.get(q.learning_target_id)?.name : undefined
                    }
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                >
                  Save
                </button>
              </form>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
