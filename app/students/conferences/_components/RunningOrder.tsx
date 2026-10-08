"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleMeetingDoneAction } from "../actions";

export type MeetingRow = {
  id: number;
  studentId: number | null;
  studentName: string | null;
  className: string | null;
  time: string | null;
  parentName: string | null;
  rawName: string;
  done: boolean;
};

/**
 * The evening, in order. Each row opens that student's conference page in
 * PARENT view — this is the one entry point where that has to be the default,
 * because every click here happens with the screen turned round. Her own view
 * is one press away on the page itself.
 */
export function RunningOrder({
  sessionId,
  meetings,
  from,
}: {
  sessionId: number;
  meetings: MeetingRow[];
  from: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function toggle(id: number, done: boolean) {
    startTransition(async () => {
      await toggleMeetingDoneAction(id, done);
      router.refresh();
    });
  }

  const remaining = meetings.filter((m) => !m.done).length;

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-2xl font-semibold">The evening</h2>
        <p className="text-sm text-slate-600">
          {remaining === 0
            ? "All done."
            : `${remaining} of ${meetings.length} still to go`}
        </p>
      </div>

      <ul className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {meetings.map((m) => (
          <li
            key={m.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 px-5 py-3.5 last:border-b-0"
          >
            <input
              type="checkbox"
              checked={m.done}
              onChange={(e) => toggle(m.id, e.target.checked)}
              aria-label={`${m.studentName ?? m.rawName} done`}
              className="h-4 w-4 shrink-0 accent-slate-900"
            />
            <span className="w-14 shrink-0 tabular-nums text-sm text-slate-600">
              {m.time ?? "—"}
            </span>
            <span className={m.done ? "flex-[1_1_14rem] text-slate-400 line-through" : "flex-[1_1_14rem]"}>
              {m.studentId ? (
                <Link
                  href={`/students/${m.studentId}/conference?from=${from}&view=parent&session=${sessionId}`}
                  className="font-medium hover:underline"
                >
                  {m.studentName}
                </Link>
              ) : (
                <span className="font-medium text-amber-800" title="This line matched no student">
                  {m.rawName}
                </span>
              )}
              {m.className && <span className="ml-2 text-sm text-slate-500">{m.className}</span>}
            </span>
            {m.parentName && <span className="text-sm text-slate-600">{m.parentName}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
