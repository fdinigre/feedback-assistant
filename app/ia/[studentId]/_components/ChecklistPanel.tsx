"use client";

import { useState } from "react";
import type { RubricCriterion } from "@/lib/ia/rubric-items";
import type { IaChecklistMark, IaChecklistStatus } from "@/lib/types";

const STATUS_LABEL: Record<IaChecklistStatus, string> = {
  evident: "Evident",
  partly: "Partly",
  not_evident: "Not evident",
};

const STATUS_STYLE: Record<IaChecklistStatus, string> = {
  evident: "border-emerald-300 bg-emerald-50",
  partly: "border-amber-300 bg-amber-50",
  not_evident: "border-slate-200 bg-white",
};

function aiStatus(m: IaChecklistMark | undefined): IaChecklistStatus {
  return m?.status ?? "not_evident";
}
export function effectiveStatus(m: IaChecklistMark | undefined): IaChecklistStatus {
  return m?.teacherStatus ?? aiStatus(m);
}

/**
 * The rubric's checklist for one criterion, judged on this draft. The AI marks which
 * statements are true of the draft (with a quote); the teacher can change any status
 * and comment on any item. Only touched items are stored.
 */
export function ChecklistPanel({
  rubric,
  marks,
  level,
  onChange,
}: {
  rubric: RubricCriterion | undefined;
  marks: IaChecklistMark[];
  level: number;
  onChange: (marks: IaChecklistMark[]) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  if (!rubric) return null;
  const byId = new Map(marks.map((m) => [m.id, m]));
  const items = rubric.bands.flatMap((b) => b.items);
  const counts = { evident: 0, partly: 0, changed: 0, comments: 0 };
  for (const i of items) {
    const m = byId.get(i.id);
    const s = effectiveStatus(m);
    if (s === "evident") counts.evident++;
    if (s === "partly") counts.partly++;
    if (m?.teacherStatus) counts.changed++;
    if (m?.comment?.trim()) counts.comments++;
  }

  function update(id: string, change: Partial<IaChecklistMark>) {
    const current: IaChecklistMark = { ...(byId.get(id) ?? { id }), ...change };
    // An override that agrees with the AI is not an override.
    if (current.teacherStatus && current.teacherStatus === aiStatus(current)) delete current.teacherStatus;
    if (current.comment !== undefined && !current.comment.trim()) delete current.comment;
    const keep = current.status || current.teacherStatus || current.comment;
    const rest = marks.filter((m) => m.id !== id);
    onChange(keep ? [...rest, current] : rest);
  }

  return (
    <details className="mt-3 rounded border border-slate-200 bg-slate-50 p-2">
      <summary className="cursor-pointer text-sm font-medium text-slate-700">
        Checklist — {counts.evident} evident · {counts.partly} partly
        {counts.changed > 0 && <span className="text-amber-700"> · {counts.changed} changed by you</span>}
        {counts.comments > 0 && <span className="text-blue-700"> · {counts.comments} comment{counts.comments === 1 ? "" : "s"}</span>}
      </summary>
      <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
        Show every item (otherwise only evident, partly, changed or commented)
      </label>
      <div className="mt-2 space-y-3">
        {rubric.bands.map((band) => {
          const shown = band.items.filter((i) => {
            if (showAll) return true;
            const m = byId.get(i.id);
            return effectiveStatus(m) !== "not_evident" || !!m?.teacherStatus || !!m?.comment;
          });
          if (shown.length === 0) return null;
          return (
            <div
              key={band.level}
              className={"rounded p-2 " + (band.level === level ? "bg-white ring-2 ring-slate-400" : "")}
            >
              <p className="text-xs font-semibold text-slate-600">
                Level {band.level}
                {band.level === level && " (current level)"} — <span className="font-normal">{band.descriptor}</span>
              </p>
              {band.notes.map((n, k) => (
                <p key={k} className="text-xs italic text-slate-500">{n}</p>
              ))}
              <ul className="mt-1 space-y-1.5">
                {shown.map((item) => {
                  const m = byId.get(item.id);
                  const s = effectiveStatus(m);
                  return (
                    <li key={item.id} className={`rounded border p-2 text-sm ${STATUS_STYLE[s]}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="mr-1 text-xs text-slate-400">{item.id}</span>
                          {item.text}
                        </span>
                        <span className="flex items-center gap-1">
                          {m?.teacherStatus ? (
                            <span className="text-xs text-amber-700" title={`AI said: ${STATUS_LABEL[aiStatus(m)]}`}>
                              you
                            </span>
                          ) : m?.status ? (
                            <span className="text-xs text-slate-400">AI</span>
                          ) : null}
                          <select
                            aria-label={`Status of ${item.id}`}
                            value={s}
                            onChange={(e) => update(item.id, { teacherStatus: e.target.value as IaChecklistStatus })}
                            className="rounded border border-slate-300 bg-white px-1 py-0.5 text-xs"
                          >
                            {(Object.keys(STATUS_LABEL) as IaChecklistStatus[]).map((k) => (
                              <option key={k} value={k}>
                                {STATUS_LABEL[k]}
                              </option>
                            ))}
                          </select>
                        </span>
                      </div>
                      {m?.quote && s !== "not_evident" && (
                        <p className="mt-1 text-xs text-slate-600">
                          &ldquo;{m.quote}&rdquo;{m.location && <span className="text-slate-400"> — {m.location}</span>}
                        </p>
                      )}
                      <input
                        aria-label={`Your comment on ${item.id}`}
                        value={m?.comment ?? ""}
                        onChange={(e) => update(item.id, { comment: e.target.value })}
                        placeholder="Your comment (optional)"
                        className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </details>
  );
}
