"use client";

import { useActionState } from "react";
import type { QuestionRow } from "@/lib/types";
import { DpQuestionSchemeCard } from "./DpQuestionSchemeCard";
import { approveParseAction, runMsParseAction, type DpFormState } from "../actions";

const initialState: DpFormState = { error: null };

export function DpParseSection({
  assessmentId,
  questions,
  hasMarkscheme,
  parseApproved,
}: {
  assessmentId: number;
  questions: QuestionRow[];
  hasMarkscheme: boolean;
  parseApproved: boolean;
}) {
  const parseAction = runMsParseAction.bind(null, assessmentId);
  const [state, formAction, pending] = useActionState(parseAction, initialState);
  const approveAction = approveParseAction.bind(null, assessmentId);

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center gap-3">
        <form action={formAction}>
          <button
            type="submit"
            disabled={pending || !hasMarkscheme}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {pending
              ? "Parsing…"
              : questions.length > 0
                ? "Re-run markscheme parse"
                : "Run markscheme parse"}
          </button>
        </form>
        {!hasMarkscheme && (
          <span className="text-xs text-slate-500">Upload the markscheme first.</span>
        )}
        {parseApproved ? (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
            Parse approved
          </span>
        ) : (
          questions.length > 0 && (
            <form action={approveAction}>
              <button
                type="submit"
                className="rounded-md border border-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
              >
                Approve parse
              </button>
            </form>
          )
        )}
      </div>
      {state.error && (
        <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {!parseApproved && questions.length > 0 && (
        <p className="text-xs text-amber-700">
          Review the parse below and edit anything the parser got wrong before approving — the
          assessment cannot be marked ready until the parse is approved.
        </p>
      )}

      {questions.length === 0 ? (
        <p className="rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
          No questions parsed yet.
        </p>
      ) : (
        <div className="space-y-4">
          {questions.map((q) => (
            <DpQuestionSchemeCard key={q.id} assessmentId={assessmentId} question={q} />
          ))}
        </div>
      )}
    </div>
  );
}
