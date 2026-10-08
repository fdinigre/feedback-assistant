"use client";

import { useState } from "react";
import { LEVEL_BANDS } from "@/lib/assessment/bands";
import type { LevelBand, RubricDescriptorRow } from "@/lib/types";

export type DescriptorFootprint = { checks: number; students: number };

type Row = {
  /** Stable React key; a row that has never been saved has no database id yet. */
  key: string;
  id: number | null;
  band: LevelBand;
  strand: string;
  text: string;
  studentText: string;
};

let nextKey = 0;
function toRow(d: RubricDescriptorRow): Row {
  return {
    key: `db-${d.id}`,
    id: d.id,
    band: d.band,
    strand: d.strand ?? "",
    text: d.text,
    studentText: d.student_text ?? "",
  };
}
function blankRow(band: LevelBand): Row {
  return { key: `new-${nextKey++}`, id: null, band, strand: "", text: "", studentText: "" };
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The band descriptors a criterion is marked against, one requirement per row.
 *
 * The whole set posts as a single JSON field carrying each row's id, the way the
 * DP markscheme card does: ids are what a student's ticks hang off, so editing a
 * statement's wording or moving it must not look like deleting it and adding a
 * new one. Removing a row that students have already been judged against says so
 * before it goes.
 */
export function RubricDescriptorEditor({
  criterion,
  descriptors,
  footprints,
  action,
}: {
  criterion: string;
  descriptors: RubricDescriptorRow[];
  footprints: Record<number, DescriptorFootprint>;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [rows, setRows] = useState<Row[]>(() => descriptors.map(toRow));
  const [dirty, setDirty] = useState(false);

  // Adopt what the server now has after a save, so the rows carry their new ids:
  // saving twice without this would post id-less rows again and insert duplicates.
  // Keyed on the content rather than the array identity, because every render of
  // the setup page hands down a fresh array — including when a different form on
  // the page revalidates it, which must not wipe an edit in progress here.
  const signature = descriptors
    .map((d) => `${d.id}:${d.band}:${d.position}:${d.strand ?? ""}:${d.text}:${d.student_text ?? ""}`)
    .join("|");
  const [prevSignature, setPrevSignature] = useState(signature);
  if (prevSignature !== signature) {
    setPrevSignature(signature);
    setRows(descriptors.map(toRow));
    setDirty(false);
  }

  const update = (next: Row[]) => {
    setRows(next);
    setDirty(true);
  };
  const patch = (key: string, fields: Partial<Row>) =>
    update(rows.map((r) => (r.key === key ? { ...r, ...fields } : r)));

  const move = (key: string, direction: -1 | 1) => {
    const row = rows.find((r) => r.key === key);
    if (!row) return;
    const inBand = rows.filter((r) => r.band === row.band);
    const idx = inBand.indexOf(row);
    const target = inBand[idx + direction];
    if (!target) return;
    update(
      rows.map((r) => (r.key === row.key ? target : r.key === target.key ? row : r))
    );
  };

  // What a save would destroy: rows that were on file and are no longer listed.
  const removedWithWork = descriptors
    .filter((d) => !rows.some((r) => r.id === d.id))
    .map((d) => ({ d, f: footprints[d.id] }))
    .filter(({ f }) => f && f.checks > 0);

  const payload = LEVEL_BANDS.flatMap((band) =>
    rows
      .filter((r) => r.band === band && r.text.trim() !== "")
      .map((r, position) => ({
        id: r.id,
        band,
        strand: r.strand.trim() || null,
        position,
        text: r.text.trim(),
        student_text: r.studentText.trim() || null,
      }))
  );

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (removedWithWork.length > 0) {
          const lines = removedWithWork.map(
            ({ d, f }) => `  • ${d.band} ${d.strand ?? ""} "${d.text}" — ${plural(f.students, "student")}`
          );
          const ok = window.confirm(
            [
              `Remove ${plural(removedWithWork.length, "descriptor")} that students have already been judged against?`,
              "",
              ...lines,
              "",
              "Their ticks and the reasoning behind them are deleted with it. This cannot be undone.",
            ].join("\n")
          );
          if (!ok) {
            e.preventDefault();
            return;
          }
        }
        setDirty(false);
      }}
      className="mt-3 rounded-md border border-slate-200 p-3"
    >
      <input type="hidden" name="descriptors_json" value={JSON.stringify(payload)} readOnly />

      <div className="flex items-baseline justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Criterion {criterion} descriptors
        </h4>
        <span className="text-xs text-slate-500">
          One requirement per row — these are what the grader ticks off.
        </span>
      </div>

      <div className="mt-3 space-y-4">
        {LEVEL_BANDS.map((band) => {
          const inBand = rows.filter((r) => r.band === band);
          return (
            <div key={band}>
              <p className="text-xs font-semibold text-slate-700">Level {band}</p>
              <div className="mt-1 space-y-1">
                {inBand.map((row, idx) => (
                  <div
                    key={row.key}
                    className="grid grid-cols-1 gap-1 sm:grid-cols-[52px_1fr_1fr_auto] sm:items-start"
                  >
                    <input
                      value={row.strand}
                      onChange={(e) => patch(row.key, { strand: e.target.value })}
                      placeholder="i"
                      title="Strand label as printed on the task"
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                    />
                    <textarea
                      value={row.text}
                      onChange={(e) => patch(row.key, { text: e.target.value })}
                      rows={2}
                      placeholder="the student is able to…"
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                    />
                    <textarea
                      value={row.studentText}
                      onChange={(e) => patch(row.key, { studentText: e.target.value })}
                      rows={2}
                      placeholder="student-facing wording (optional)"
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                    />
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => move(row.key, -1)}
                        disabled={idx === 0}
                        className="rounded border border-slate-300 px-1.5 py-1 text-xs disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(row.key, 1)}
                        disabled={idx === inBand.length - 1}
                        className="rounded border border-slate-300 px-1.5 py-1 text-xs disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => update(rows.filter((r) => r.key !== row.key))}
                        title={
                          row.id != null && footprints[row.id]?.checks
                            ? `${plural(footprints[row.id].students, "student")} judged against this`
                            : undefined
                        }
                        className="rounded border border-red-200 px-1.5 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => update([...rows, blankRow(band)])}
                  className="rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  + Add statement
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
        >
          Save Criterion {criterion} descriptors
        </button>
        {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
      </div>
    </form>
  );
}
