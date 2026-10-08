"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  assignAliasAction,
  rosterOptionsAction,
  saveScheduleDaysAction,
  uploadScheduleAction,
  type RosterOption,
  type ScheduleDay,
} from "../actions";
import { StudentPicker } from "./StudentPicker";

/**
 * The main way in: the booking system's print view, read on this machine.
 *
 * It stands on its own rather than inside the paste panel because one file
 * carries several evenings and creates them all — there is nothing to select
 * before using it.
 */
/**
 * The student's name as the schedule wrote it, which is what gets remembered.
 * The row's raw text is the whole line — student then parents — and the first
 * two words are the name in this booking system's layout.
 */
function writtenNameOf(raw: string): string {
  return raw.split(/\s+/).slice(0, 2).join(" ");
}

export function ScheduleUpload() {
  const router = useRouter();
  const [days, setDays] = useState<ScheduleDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<RosterOption[]>([]);
  const [pending, startTransition] = useTransition();

  /**
   * Points an unmatched line at a student and remembers the name it was written
   * under, so the next upload resolves it on its own. Every other line written
   * the same way is resolved here too.
   */
  function assign(written: string, studentId: number) {
    const option = options.find((o) => o.id === studentId);
    if (!option || !days) return;
    startTransition(async () => {
      await assignAliasAction(studentId, written);
      setDays((current) =>
        current
          ? current.map((day) => ({
              ...day,
              rows: day.rows.map((row) =>
                row.studentId === null && writtenNameOf(row.raw) === written
                  ? {
                      ...row,
                      studentId: option.id,
                      studentName: written,
                      className: option.className,
                      status: "matched" as const,
                    }
                  : row
              ),
            }))
          : current
      );
    });
  }

  /** Chunked so a multi-megabyte PDF does not blow the call stack on btoa. */
  function toBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return btoa(binary);
  }

  function upload(file: File) {
    setError(null);
    setDays(null);
    startTransition(async () => {
      if (options.length === 0) setOptions(await rosterOptionsAction());
      const result = await uploadScheduleAction(toBase64(await file.arrayBuffer()));
      if (result.error) {
        setError(result.error);
        return;
      }
      setDays(result.days ?? null);
    });
  }

  function save() {
    if (!days) return;
    startTransition(async () => {
      const id = await saveScheduleDaysAction(days);
      setDays(null);
      if (id) router.push(`/students/conferences?session=${id}`);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-semibold">Upload the schedule</h2>
      <p className="mt-1 max-w-[70ch] text-[15px] text-slate-700">
        The booking system&rsquo;s print view, as it comes. It reads every evening in the file,
        with the parents coming to each meeting, and matches the students against your roster.
        Read on this machine — the names are not sent anywhere.
      </p>
      <input
        type="file"
        accept="application/pdf"
        disabled={pending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = "";
        }}
        className="mt-4 block text-sm"
      />
      {pending && <p className="mt-2 text-sm text-slate-600">Reading…</p>}
      {error && (
        <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-slate-800">
          {error}
        </p>
      )}

      {days && (
        <div className="mt-5 rounded-md border border-slate-200 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium">
              {days.length} evening{days.length === 1 ? "" : "s"} ·{" "}
              {days.reduce((n, d) => n + d.rows.length, 0)} meetings
            </p>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Save all
            </button>
          </div>
          {days.map((d) => {
            const missing = d.rows.filter((r) => !r.studentId);
            return (
              <div key={d.date} className="mt-3 border-t border-slate-100 pt-3">
                <p className="text-sm">
                  <span className="font-medium">{d.date}</span> — {d.rows.length} meetings,{" "}
                  {d.rows[0]?.time} to {d.rows[d.rows.length - 1]?.time}
                </p>
                {missing.length > 0 && (
              <ul className="mt-2 space-y-2">
                {missing.map((row, i) => {
                  const written = writtenNameOf(row.raw);
                  return (
                    <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-amber-800">{row.time}</span>
                      <span className="font-medium text-amber-800">{written}</span>
                      <span className="text-slate-600">is not on your roster —</span>
                      <StudentPicker
                        writtenName={written}
                        options={options}
                        disabled={pending}
                        onPick={(id) => assign(written, id)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
