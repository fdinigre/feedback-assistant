"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveTypedMarksAction, type TypedMarksResult } from "@/lib/marks-import/actions";
import type { TypedGrid } from "@/lib/marks-import/typed";

/** "4", "4.5" or "4,5" -> a number; "" -> null; anything else -> NaN. */
function parseCell(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (t === "") return null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/**
 * Type your own marks beside the app's, as the alternative to uploading a
 * spreadsheet. A cell shows the app's mark until you type yours; one that differs
 * is tinted. Saving changes no mark: the differences are listed below to settle,
 * exactly as an uploaded sheet's are.
 */
export function TypedMarks({ assessmentId, grid }: { assessmentId: number; grid: TypedGrid }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<number, Record<string, string>>>(() =>
    Object.fromEntries(
      grid.rows.map((r) => [
        r.submissionId,
        Object.fromEntries(
          grid.columns.map((c) => [c.key, r.cells[c.key].mine !== null ? String(r.cells[c.key].mine) : ""])
        ),
      ])
    )
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<TypedMarksResult | null>(null);

  const set = (submissionId: number, key: string, text: string) => {
    setDone(null);
    setValues((v) => ({ ...v, [submissionId]: { ...v[submissionId], [key]: text } }));
  };

  function startFromApp() {
    setDone(null);
    setValues((v) => {
      const next = { ...v };
      for (const r of grid.rows) {
        next[r.submissionId] = { ...next[r.submissionId] };
        for (const c of grid.columns) {
          const cell = r.cells[c.key];
          if (cell.sits && cell.ai !== null && (next[r.submissionId][c.key] ?? "").trim() === "") {
            next[r.submissionId][c.key] = String(cell.ai);
          }
        }
      }
      return next;
    });
  }

  async function save() {
    setError(null);
    setDone(null);
    const marks = [];
    for (const r of grid.rows) {
      for (const c of grid.columns) {
        if (!r.cells[c.key].sits) continue;
        const value = parseCell(values[r.submissionId]?.[c.key] ?? "");
        if (Number.isNaN(value)) {
          setError(`${r.name}, ${c.label}: "${values[r.submissionId][c.key]}" is not a number.`);
          return;
        }
        if (value !== null && value > c.max) {
          setError(`${r.name}, ${c.label}: ${value} is above the maximum of ${c.max}.`);
          return;
        }
        marks.push({ submissionId: r.submissionId, questionId: c.questionId, part: c.part, value });
      }
    }
    setBusy(true);
    try {
      const result = await saveTypedMarksAction(assessmentId, marks);
      if (result.error) setError(result.error);
      else {
        setDone(result);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (grid.rows.length === 0 || grid.columns.length === 0) return null;

  return (
    <details className="rounded-lg border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-slate-800">
        Or type your own marks here, to compare with the app&rsquo;s
      </summary>
      <p className="mt-2 text-xs text-slate-500">
        Each cell shows the app&rsquo;s mark in grey. Type yours where you have one; leave the rest empty.
        Cells that differ turn amber. Saving changes no mark: the differences are listed below for you to
        settle, as with an uploaded sheet.
      </p>

      <div className="mt-3 max-h-[28rem] overflow-auto rounded-md border border-slate-200">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left font-medium">Student</th>
              {grid.columns.map((c) => (
                <th key={c.key} className="px-1 py-2 text-center font-medium">
                  {c.label}
                  <div className="font-normal text-slate-400">/{c.max}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((r) => (
              <tr key={r.submissionId} className="border-t border-slate-100">
                <td className="sticky left-0 whitespace-nowrap bg-white px-3 py-1 font-medium text-slate-800">
                  {r.name}
                </td>
                {grid.columns.map((c) => {
                  const cell = r.cells[c.key];
                  if (!cell.sits) {
                    return (
                      <td key={c.key} className="px-1 py-1 text-center text-slate-300">
                        –
                      </td>
                    );
                  }
                  const text = values[r.submissionId]?.[c.key] ?? "";
                  const typed = parseCell(text);
                  const differs = typed !== null && !Number.isNaN(typed) && typed !== cell.ai;
                  return (
                    <td key={c.key} className="px-1 py-1 text-center">
                      <input
                        inputMode="decimal"
                        aria-label={`${r.name}, ${c.label}, out of ${c.max}`}
                        value={text}
                        placeholder={cell.ai !== null ? String(cell.ai) : ""}
                        onChange={(e) => set(r.submissionId, c.key, e.target.value)}
                        className={`w-12 rounded border px-1 py-0.5 text-center tabular-nums placeholder:text-slate-300 ${
                          differs ? "border-amber-300 bg-amber-50 font-semibold" : "border-slate-200"
                        }`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}
      {done && (
        <p className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          Saved {done.saved} mark{done.saved === 1 ? "" : "s"}.{" "}
          {done.differing === 0
            ? "All of them match the app."
            : `${done.differing} differ from the app — they are listed below to settle.`}
          {done.settled > 0 &&
            ` ${done.settled} paper${done.settled === 1 ? "" : "s"} you typed in full and that agree ${done.settled === 1 ? "is" : "are"} now settled.`}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save my marks"}
        </button>
        <button
          type="button"
          onClick={startFromApp}
          disabled={busy}
          className="text-xs text-slate-600 underline hover:text-slate-900"
        >
          Start from the app&rsquo;s marks (fills the empty cells)
        </button>
      </div>
    </details>
  );
}
