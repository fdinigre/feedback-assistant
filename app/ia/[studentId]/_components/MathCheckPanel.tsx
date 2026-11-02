"use client";

import { useState } from "react";
import type { IaMathCheck, IaMathFinding } from "@/lib/types";
import { mathId, noteDomId } from "@/lib/ia/feedback-targets";
import { LocateButton } from "./DraftViewer";

/** The first page number in a location such as "p. 4", "pp. 11-13, Section 3.3"; null when there is none. */
function firstPage(location: string): number | null {
  const m = /(?:\bpp?\.?|\bpages?)\s*(\d{1,3})/i.exec(location) ?? /^\s*(\d{1,3})\b/.exec(location);
  return m ? Number(m[1]) : null;
}

/** An older check's one long summary, split at its "pp. 7-12:" labels so each range reads on its own. */
function splitSummary(text: string): string[] {
  return text
    .split(/\s(?=pp?\.\s*\d+(?:\s*-\s*\d+)?:)/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * What the math check found, problems first: grouped by page, major before minor.
 * The teacher note (with the correct value) stays with the teacher; the student
 * note only points at the problem, as the IB requires, and is what may go into the
 * student's copy. "Not a problem" leaves a finding out of the student copy. What
 * was checked and found correct, and what could not be verified, are folded away
 * for when the teacher wants to follow the check.
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
  const [majorOnly, setMajorOnly] = useState(false);
  if (!check && !error) return null;
  if (!check)
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
        The math check did not run: {error} The rest of the feedback below was still generated —
        use &ldquo;Run math check only&rdquo; to try the math check again.
      </div>
    );

  function patch(i: number, change: Partial<IaMathFinding>) {
    if (!check) return;
    onChange({ ...check, findings: check.findings.map((f, k) => (k === i ? { ...f, ...change } : f)) });
  }

  const active = check.findings.filter((f) => !f.dismissed);
  const majors = active.filter((f) => f.severity === "major").length;
  // Keep each finding's original index: it is the id the draft viewer uses.
  const indexed = check.findings
    .map((f, i) => ({ f, i, page: firstPage(f.location) }))
    .filter(({ f }) => !majorOnly || f.severity === "major");
  const pages = [...new Set(indexed.map((x) => x.page))].sort((a, b) => (a ?? 9999) - (b ?? 9999));
  const checked = check.checked ?? [];

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Math check</h3>
        <span className="text-xs text-slate-500">
          {active.length} problem{active.length === 1 ? "" : "s"}
          {majors > 0 && <span className="font-medium text-rose-700"> · {majors} major</span>}
          {check.usedPageImages ? " · read from the page images" : " · text only"}
        </span>
      </div>

      {!check.usedPageImages && (
        <p className="mt-1 text-xs text-amber-700">
          Only the text was checked, so equations and graphs were not seen.{" "}
          {check.textOnlyReason === "word"
            ? "This draft is a Word file: save it as a PDF, re-upload it, then run the math check again."
            : check.textOnlyReason === "scan"
              ? "This PDF has no text layer (it is a scan), so the names on its pages could not be removed and the pages were not sent. Ask for a PDF exported from the student's document."
              : check.textOnlyReason === "too-long"
                ? "This PDF is over 80 pages, so its pages were not sent. Check that the right file was uploaded."
                : "This check was run before page images were used for long drafts — run the math check again to check the pages."}
        </p>
      )}

      {check.findings.length > 0 && (
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={majorOnly} onChange={(e) => setMajorOnly(e.target.checked)} />
          Major problems only
        </label>
      )}

      <div className="mt-2 space-y-3">
        {pages.map((pg) => (
          <div key={pg ?? "none"}>
            <p className="text-xs font-semibold text-slate-500">{pg == null ? "No page given" : `Page ${pg}`}</p>
            <ul className="mt-1 space-y-2">
              {indexed
                .filter((x) => x.page === pg)
                .sort((a, b) => (a.f.severity === b.f.severity ? a.i - b.i : a.f.severity === "major" ? -1 : 1))
                .map(({ f, i }) => (
                  <li
                    key={i}
                    id={noteDomId(mathId(i))}
                    className={
                      "rounded border p-2 text-sm transition-shadow " +
                      (f.dismissed
                        ? "border-slate-200 bg-slate-50 opacity-60"
                        : f.severity === "major"
                          ? "border-rose-300 bg-rose-50"
                          : "border-amber-200 bg-amber-50")
                    }
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-xs">
                        <span
                          className={
                            "rounded px-1.5 py-0.5 font-semibold uppercase tracking-wide " +
                            (f.severity === "major" ? "bg-rose-200 text-rose-900" : "bg-amber-200 text-amber-900")
                          }
                        >
                          {f.severity}
                        </span>
                        <span className="text-slate-600">{f.kind}</span>
                        <LocateButton id={mathId(i)} />
                      </span>
                      <label className="flex items-center gap-1 text-xs text-slate-600">
                        <input type="checkbox" checked={!!f.dismissed} onChange={(e) => patch(i, { dismissed: e.target.checked })} />
                        Not a problem
                      </label>
                    </div>
                    {f.quote && <p className="mt-1 text-slate-800">&ldquo;{f.quote}&rdquo;</p>}
                    {f.location && firstPage(f.location) !== null && !/^\s*pp?\.\s*\d+\s*$/i.test(f.location) && (
                      <p className="text-xs text-slate-500">{f.location}</p>
                    )}
                    <p className="mt-1 text-sm text-slate-700">
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
          </div>
        ))}
        {check.findings.length === 0 && <p className="text-sm text-slate-600">No problems found.</p>}
      </div>

      <details className="mt-3 rounded border border-slate-200 bg-slate-50 p-2">
        <summary className="cursor-pointer text-xs font-medium text-slate-600">
          What was checked and found correct{checked.length > 0 ? ` (${checked.length})` : ""}
        </summary>
        {checked.length > 0 ? (
          <>
            {check.checkedSummary && <p className="mt-2 text-xs text-slate-600">{check.checkedSummary}</p>}
            <ul className="mt-2 space-y-1 text-xs text-slate-700">
              {[...checked]
                .sort((a, b) => (firstPage(a.location) ?? 9999) - (firstPage(b.location) ?? 9999))
                .map((c, k) => (
                  <li key={k} className="flex gap-2">
                    <span className="w-16 shrink-0 text-slate-500">{c.location}</span>
                    <span>{c.what}</span>
                  </li>
                ))}
            </ul>
          </>
        ) : (
          <div className="mt-2 space-y-2 text-xs text-slate-700">
            {splitSummary(check.checkedSummary).map((t, k) => (
              <p key={k}>{t}</p>
            ))}
          </div>
        )}
      </details>

      {check.uncheckable.length > 0 && (
        <details className="mt-2 rounded border border-slate-200 bg-slate-50 p-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-600">
            Could not verify ({check.uncheckable.length})
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-700">
            {check.uncheckable.map((u, k) => (
              <li key={k}>{u}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
