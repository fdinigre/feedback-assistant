"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GradesTable as GradesTableData } from "@/lib/assessment/grades-table";

const LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

async function saveLevel(submissionId: number, criterion: string, levelFinal: number): Promise<string | null> {
  try {
    const res = await fetch("/api/review/criterion-level", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId, criterion, levelFinal }),
    });
    if (res.ok) return null;
    const json = await res.json().catch(() => null);
    return (json?.error as string | undefined) ?? `Save failed (${res.status}).`;
  } catch {
    return "Network error — could not reach the server.";
  }
}

/**
 * The whole class's grades for one assessment, to read against her own
 * markbook in one view. Each name opens the paper; each criterion level can be
 * changed where it stands, which saves it as the final level exactly as the
 * review page does. Amber is still the tool's cautious reading.
 */
export function GradesTable({ table }: { table: GradesTableData }) {
  const router = useRouter();
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const key = (submissionId: number, criterion: string) => `${submissionId}-${criterion}`;
  const unconfirmed = table.rows.flatMap((row) =>
    table.criteria.flatMap((c) =>
      row.levels[c]?.provisional ? [{ submissionId: row.submissionId, criterion: c, level: row.levels[c].level }] : []
    )
  );

  async function change(submissionId: number, criterion: string, level: number) {
    const k = key(submissionId, criterion);
    setSaving((s) => ({ ...s, [k]: true }));
    setError(null);
    const failed = await saveLevel(submissionId, criterion, level);
    setSaving((s) => ({ ...s, [k]: false }));
    if (failed) setError(failed);
    router.refresh();
  }

  // Once the ones that differ from her markbook are fixed, the rest are the
  // levels she agrees with: one click makes them final rather than one per cell.
  async function confirmAll() {
    setConfirming(true);
    setError(null);
    const results = await Promise.all(unconfirmed.map((u) => saveLevel(u.submissionId, u.criterion, u.level)));
    const failed = results.filter(Boolean);
    if (failed.length > 0) setError(`${failed.length} could not be saved: ${failed[0]}`);
    setConfirming(false);
    router.refresh();
  }

  return (
    <div>
      {table.kind === "levels" && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
          <span>
            <span className="font-semibold text-slate-900">Black</span> is a level you have confirmed;{" "}
            <span className="font-semibold text-amber-700">amber</span>{" "}is still the tool&rsquo;s cautious
            reading. Change any level here and it is saved as final.
          </span>
          {unconfirmed.length > 0 && (
            <button
              type="button"
              onClick={confirmAll}
              disabled={confirming}
              className="ml-auto rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-100 disabled:opacity-50"
            >
              {confirming
                ? "Confirming…"
                : `Confirm the ${unconfirmed.length} amber level${unconfirmed.length === 1 ? "" : "s"} as shown`}
            </button>
          )}
        </div>
      )}
      {error && <p className="mb-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="px-4 py-2 font-medium text-slate-500">Student</th>
              {table.kind === "levels" ? (
                table.criteria.map((c) => (
                  <th key={c} className="w-24 px-3 py-2 text-center font-medium text-slate-600">
                    {c}
                  </th>
                ))
              ) : (
                <th className="px-3 py-2 font-medium text-slate-600">Grade</th>
              )}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => {
              const marked = row.status === "graded" || row.status === "reviewed";
              return (
                <tr key={row.submissionId} className="border-b border-slate-100 last:border-0">
                  <td className="whitespace-nowrap px-4 py-1.5">
                    <Link
                      href={`/submissions/${row.submissionId}`}
                      className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-600"
                    >
                      {row.name}
                    </Link>
                  </td>
                  {row.status === "absent" || !marked ? (
                    <td
                      colSpan={table.kind === "levels" ? table.criteria.length : 1}
                      className="px-3 py-1.5 text-center text-xs text-slate-400"
                    >
                      {row.status === "absent" ? "absent" : "not marked yet"}
                    </td>
                  ) : table.kind === "levels" ? (
                    table.criteria.map((c) => {
                      const cell = row.levels[c];
                      if (!cell) {
                        return (
                          <td key={c} className="px-3 py-1.5 text-center text-slate-300">
                            —
                          </td>
                        );
                      }
                      const k = key(row.submissionId, c);
                      return (
                        <td key={c} className="px-3 py-1 text-center">
                          <select
                            aria-label={`Criterion ${c} for ${row.name}`}
                            title={
                              cell.provisional
                                ? `Not confirmed — the tool proposed ${cell.proposed}, cautiously ${cell.conservative}`
                                : `Confirmed · the tool proposed ${cell.proposed}`
                            }
                            value={cell.level}
                            disabled={saving[k] || confirming}
                            onChange={(e) => change(row.submissionId, c, Number(e.target.value))}
                            className={`cursor-pointer appearance-none rounded border border-transparent bg-transparent px-2 py-0.5 text-center text-base font-semibold tabular-nums hover:border-slate-300 focus:border-slate-400 focus:outline-none disabled:opacity-50 ${
                              cell.provisional ? "text-amber-700" : "text-slate-900"
                            }`}
                          >
                            {LEVELS.map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    })
                  ) : (
                    <td className="px-3 py-1.5">
                      <span className="text-base font-semibold tabular-nums">{row.summary ?? "—"}</span>
                      {row.summarySub && <span className="ml-1.5 text-xs text-slate-500">{row.summarySub}</span>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
