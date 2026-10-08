"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  previewYearPlanAction,
  confirmYearPlanAction,
  deleteYearPlanAction,
  type YearPlanSummary,
} from "../actions";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export type LoadedPlan = {
  fileName: string;
  startYear: number;
  uploadedAt: string;
  entries: number;
  lessons: number;
  breaks: number;
  firstDate: string | null;
  lastDate: string | null;
};

/**
 * Loads the class's daily plan for the year from the teacher's own spreadsheet.
 *
 * Preview before save, because a planner whose dates carry no year has to be
 * anchored to one: get that wrong and every date shifts by a year with nothing
 * downstream to notice. The file stays in the browser between the two steps and
 * is sent again on save, rather than ninety parsed rows making the round trip.
 */
export function YearPlanImport({ classId, loaded }: { classId: number; loaded: LoadedPlan | null }) {
  const router = useRouter();
  const [fileName, setFileName] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [summary, setSummary] = useState<YearPlanSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setFileName(null);
    setBase64(null);
    setSummary(null);
    setError(null);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setSaved(null);
    const encoded = arrayBufferToBase64(await file.arrayBuffer());
    setFileName(file.name);
    setBase64(encoded);
    startTransition(async () => {
      const result = await previewYearPlanAction(classId, file.name, encoded);
      if (result.error) {
        setError(result.error);
        setSummary(null);
        return;
      }
      setSummary(result.summary ?? null);
    });
  }

  function reread(startYear: number) {
    if (!base64 || !fileName) return;
    startTransition(async () => {
      const result = await previewYearPlanAction(classId, fileName, base64, startYear);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSummary(result.summary ?? null);
    });
  }

  function save() {
    if (!base64 || !fileName || !summary) return;
    startTransition(async () => {
      const result = await confirmYearPlanAction(classId, fileName, base64, summary.startYear);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(`Saved ${result.entries} rows.`);
      reset();
      router.refresh();
    });
  }

  function remove() {
    if (!window.confirm("Remove this class's year plan? The spreadsheet is untouched.")) return;
    startTransition(async () => {
      await deleteYearPlanAction(classId);
      setSaved(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        The daily plan this class follows, from your own spreadsheet. It is what the app uses to say
        what is coming up for a student — assessments only appear here once you are about to mark
        them, so nothing else knows about the rest of the year.
      </p>

      {loaded && !summary && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-800">{loaded.fileName}</p>
          <p className="mt-0.5 text-slate-600">
            {formatDate(loaded.firstDate)} → {formatDate(loaded.lastDate)} · {loaded.lessons}{" "}
            lesson{loaded.lessons === 1 ? "" : "s"}
            {loaded.breaks > 0 ? ` · ${loaded.breaks} breaks` : ""} · loaded{" "}
            {loaded.uploadedAt.slice(0, 10)}
          </p>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="mt-2 rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Remove plan
          </button>
        </div>
      )}

      <label className="inline-flex items-center gap-2 text-sm">
        <span className="rounded-md border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50">
          {loaded ? "Replace with another file" : "Upload the year plan (.xlsx)"}
        </span>
        <input type="file" accept=".xlsx" onChange={handleFile} className="hidden" />
      </label>

      {pending && <p className="text-xs text-slate-500">Reading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-emerald-700">{saved}</p>}

      {summary && (
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-800">{summary.fileName}</p>
          <p className="mt-1 text-sm text-slate-700">
            {formatDate(summary.firstDate)} → {formatDate(summary.lastDate)} · {summary.lessons}{" "}
            lessons · {summary.breaks} breaks · {summary.assessments} with criteria
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Sheet &ldquo;{summary.sheetName}&rdquo;
            {summary.yearFromFile
              ? " · the dates carry their own year"
              : ` · dates have no year, read as the ${summary.startYear}/${String(summary.startYear + 1).slice(2)} school year`}
          </p>

          {!summary.yearFromFile && (
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
              School year starts in August
              <select
                value={summary.startYear}
                onChange={(e) => reread(Number(e.target.value))}
                disabled={pending}
                className="rounded border border-slate-300 px-2 py-1 text-xs"
              >
                {[summary.startYear - 1, summary.startYear, summary.startYear + 1].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          )}

          <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
            {summary.sample.map((s, i) => (
              <li key={i}>
                {s.date}
                {s.endDate ? ` → ${s.endDate}` : ""} · {s.kind === "break" ? "break: " : ""}
                {s.topic}
              </li>
            ))}
            {summary.lessons + summary.breaks > summary.sample.length && (
              <li className="text-slate-400">
                … and {summary.lessons + summary.breaks - summary.sample.length} more
              </li>
            )}
          </ul>

          {summary.skipped.length > 0 && (
            <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              <p className="font-semibold">
                {summary.skipped.length} row{summary.skipped.length === 1 ? "" : "s"} skipped — the
                dates look wrong in the spreadsheet:
              </p>
              <ul className="mt-1 space-y-0.5">
                {summary.skipped.map((s) => (
                  <li key={s.row}>
                    row {s.row}: &ldquo;{s.cell}&rdquo; — {s.why}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.undated.length > 0 && (
            <div className="mt-2 text-xs text-slate-500">
              <p>
                {summary.undated.length} row{summary.undated.length === 1 ? "" : "s"} had no date to
                read:
              </p>
              <ul className="mt-0.5">
                {summary.undated.map((u) => (
                  <li key={u.row}>
                    row {u.row}: &ldquo;{u.text}&rdquo;
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {loaded ? "Replace the plan" : "Save the plan"}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={pending}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
