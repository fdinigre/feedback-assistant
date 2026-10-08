"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewScheduleAction, saveScheduleAction, type PreviewRow } from "../actions";

/**
 * Paste the evening's schedule, see what it resolved to, then save it.
 *
 * Preview before save is the whole point: an unmatched or ambiguous name is
 * shown as a question with the roster's candidates beside it, never guessed.
 * Nothing is written until she has looked at it.
 */
export function ScheduleEditor({
  sessionId,
  initialText,
}: {
  sessionId: number;
  initialText: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [pending, startTransition] = useTransition();

  function preview() {
    startTransition(async () => setRows(await previewScheduleAction(text)));
  }

  function choose(index: number, studentId: number, name: string, className: string) {
    setRows((r) =>
      r
        ? r.map((row, i) =>
            i === index
              ? { ...row, studentId, studentName: name, className, status: "matched" }
              : row
          )
        : r
    );
  }

  function drop(index: number) {
    setRows((r) => (r ? r.filter((_, i) => i !== index) : r));
  }

  function save() {
    if (!rows) return;
    startTransition(async () => {
      await saveScheduleAction(
        sessionId,
        rows.map((r) => ({
          studentId: r.studentId,
          time: r.time,
          parentName: r.parentName,
          raw: r.raw,
        }))
      );
      setRows(null);
      router.refresh();
    });
  }

  const unresolved = rows?.filter((r) => r.status !== "matched").length ?? 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-semibold">Or paste it</h2>
      <p className="mt-1 max-w-[70ch] text-[15px] text-slate-700">
        A time, the student and the parent on each line, or just a list of names. The order you
        paste is the order of the evening, unless every line carries a time, in which case they
        sort by it.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={"16:00\tAlex Morgan\tMrs Morgan\n16:20\tSam Rivera\tMr & Mrs Rivera"}
        className="mt-4 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={preview}
          disabled={pending || text.trim() === ""}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "Reading…" : "Read the schedule"}
        </button>
        {rows && (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Save {rows.length} meeting{rows.length === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {rows && (
        <div className="mt-5">
          {unresolved > 0 && (
            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-slate-800">
              {unresolved} line{unresolved === 1 ? "" : "s"} did not resolve to one student. Pick
              the right one, or drop the line — saving as it is leaves those meetings with no page
              to open.
            </p>
          )}
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {rows.map((row, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="w-12 shrink-0 tabular-nums text-slate-600">{row.time ?? "—"}</span>
                {row.status === "matched" ? (
                  <>
                    <span className="font-medium">{row.studentName}</span>
                    <span className="text-slate-500">{row.className}</span>
                  </>
                ) : (
                  <>
                    <span className="font-medium text-amber-800">{row.raw}</span>
                    <span className="text-xs text-slate-500">
                      {row.status === "ambiguous" ? "more than one match" : "no match"}
                    </span>
                    {row.candidates.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => choose(i, c.id, c.name, c.className)}
                        className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100"
                      >
                        {c.name} · {c.className}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => drop(i)}
                      className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
                    >
                      Drop
                    </button>
                  </>
                )}
                {row.parentName && (
                  <span className="ml-auto text-slate-600">{row.parentName}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
