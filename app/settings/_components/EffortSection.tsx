"use client";

import { useState, useTransition } from "react";
import { saveEffortAction } from "../actions";
import { EFFORT_DEFAULTS, EFFORTS, type Effort, type EffortKind } from "@/lib/ai/effort";

const KINDS: { kind: EffortKind; title: string; detail: string }[] = [
  {
    kind: "studentWork",
    title: "Reading and marking student work",
    detail: "Transcription, both marking passes, reports and mistake tags.",
  },
  {
    kind: "setup",
    title: "Setting up an assessment",
    detail: "Reading the blank test, proposing questions and answer keys, reading markschemes.",
  },
];

const LABEL: Record<Effort, string> = {
  low: "Low — fastest",
  medium: "Medium",
  high: "High — most careful",
};

export function EffortSection({
  current,
  onGemini,
}: {
  current: Record<EffortKind, Effort>;
  /** The settings only steer Gemini; a copy running on Claude shows them for reference. */
  onGemini: boolean;
}) {
  const [values, setValues] = useState(current);
  const [saved, setSaved] = useState<EffortKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(kind: EffortKind, value: Effort) {
    setValues((v) => ({ ...v, [kind]: value }));
    setSaved(null);
    setError(null);
    startTransition(async () => {
      const res = await saveEffortAction(kind, value);
      if (res.error) setError(res.error);
      else setSaved(kind);
    });
  }

  return (
    <section>
      <h2 className="text-lg font-medium">AI effort</h2>
      <p className="mt-1 text-sm text-slate-600">
        How carefully Gemini works. Higher is slower and more thorough. On a real handwritten paper,
        High took about 6 minutes and Medium about 4; both read the answers the same way, but only
        High noticed a crossed-out word — which matters, since crossed-out work earns nothing.
      </p>
      {!onGemini && (
        <p className="mt-2 text-sm text-amber-800">
          Claude is doing the marking (see AI above), so these have no effect until you switch back
          to Gemini.
        </p>
      )}
      <div className="mt-3 divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
        {KINDS.map(({ kind, title, detail }) => (
          <div key={kind} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900">{title}</p>
              <p className="text-xs text-slate-500">{detail}</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={values[kind]}
                onChange={(e) => choose(kind, e.target.value as Effort)}
                disabled={pending || !onGemini}
                aria-label={title}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-500"
              >
                {EFFORTS.map((e) => (
                  <option key={e} value={e}>
                    {LABEL[e]}
                    {e === EFFORT_DEFAULTS[kind] ? " (recommended)" : ""}
                  </option>
                ))}
              </select>
              {saved === kind && <span className="text-xs text-emerald-700">Saved</span>}
            </div>
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
