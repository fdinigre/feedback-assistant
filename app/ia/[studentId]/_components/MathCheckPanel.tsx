"use client";

import type { IaMathCheck, IaMathFinding } from "@/lib/types";

/**
 * What the math check found. The teacher note (with the correct value) stays with
 * the teacher; the student note only points at the problem, as the IB requires,
 * and is what may go into the student's copy. "Not a problem" leaves a finding
 * out of the student copy.
 */
export function MathCheckPanel({
  check,
  error,
  onChange,
}: {
  check: IaMathCheck | undefined;
  error: string | undefined;
  onChange: (next: IaMathCheck) => void;
}) {
  if (!check && !error) return null;
  if (!check)
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
        The math check did not run: {error} The rest of the feedback below was still generated —
        regenerate to try the math check again.
      </div>
    );

  function patch(i: number, change: Partial<IaMathFinding>) {
    if (!check) return;
    onChange({ ...check, findings: check.findings.map((f, k) => (k === i ? { ...f, ...change } : f)) });
  }
  const active = check.findings.filter((f) => !f.dismissed);

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Math check</h3>
        <span className="text-xs text-slate-500">
          {active.length} problem{active.length === 1 ? "" : "s"}
          {check.usedPageImages ? " · read from the page images" : " · text only (no page images)"}
        </span>
      </div>
      {check.checkedSummary && <p className="mt-1 text-sm text-slate-700">{check.checkedSummary}</p>}
      {!check.usedPageImages && (
        <p className="mt-1 text-xs text-amber-700">
          Only the text could be checked (a Word file, a scan, or a very long PDF), so equations and
          graphs may have been missed.
        </p>
      )}
      <ul className="mt-2 space-y-2">
        {check.findings.map((f, i) => (
          <li
            key={i}
            className={
              "rounded border p-2 text-sm " +
              (f.dismissed
                ? "border-slate-200 bg-slate-50 opacity-60"
                : f.severity === "major"
                  ? "border-rose-300 bg-rose-50"
                  : "border-amber-200 bg-amber-50")
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-600">
                {f.severity === "major" ? "Major" : "Minor"} · {f.kind} · {f.location}
              </span>
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={!!f.dismissed}
                  onChange={(e) => patch(i, { dismissed: e.target.checked })}
                />
                Not a problem
              </label>
            </div>
            {f.quote && <p className="mt-1 text-slate-700">&ldquo;{f.quote}&rdquo;</p>}
            <p className="mt-1 text-xs text-slate-600">
              <span className="font-medium">For you:</span> {f.teacherNote}
            </p>
            <label className="mt-1 block text-xs font-medium text-slate-500">
              For the student (points to the problem, does not correct it)
            </label>
            <input
              value={f.studentNote}
              onChange={(e) => patch(i, { studentNote: e.target.value })}
              className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            />
          </li>
        ))}
      </ul>
      {check.uncheckable.length > 0 && (
        <div className="mt-2 text-xs text-slate-500">
          <p className="font-medium">Could not verify</p>
          <ul className="list-disc pl-5">
            {check.uncheckable.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
