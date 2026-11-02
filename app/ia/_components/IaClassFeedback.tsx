"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { MathState } from "@/lib/ia/feedback-state";
import type { ClassJob, ClassRun } from "@/lib/ia/class-run-core";

export type ClassFeedbackRow = {
  studentId: number;
  name: string;
  explorationId: number | null;
  draftAt: string | null; // latest draft upload
  feedbackAt: string | null; // latest draft feedback (with criteria)
  mathDone: boolean; // the latest draft has a math check
  mathState: MathState; // whether the feedback was written with the current math check
};

type Job = ClassJob;

/** Feedback newer than the draft and written with the current math check. */
function upToDate(r: ClassFeedbackRow): boolean {
  return !!r.draftAt && !!r.feedbackAt && r.feedbackAt >= r.draftAt && r.mathState === "ok";
}

const POLL_MS = 3000;

/**
 * Class-wide runs: draft feedback (math check, then feedback) or the math check
 * alone, for every student who needs it, two at a time. The run happens in the
 * app's server, so this page can be left or reloaded: it picks the run up again
 * and shows its progress. Stop lets the ones already running finish and starts no
 * more. Only one class run at a time.
 */
export function IaClassFeedback({ rows, classId }: { rows: ClassFeedbackRow[]; classId: number }) {
  const router = useRouter();
  const withDraft = rows.filter((r) => r.draftAt && r.explorationId != null);
  const [skipDone, setSkipDone] = useState(true);
  const [run, setRun] = useState<ClassRun | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wasRunning = useRef(false);

  const running = run && !run.finishedAt ? run : null;
  const mine = run && run.classId === classId ? run : null;
  const otherClassRunning = running && running.classId !== classId;

  // Picks up a run already going (started earlier, or from another tab), and
  // follows it while it runs; refreshes the page data once it finishes.
  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    async function poll() {
      try {
        const res = await fetch("/api/ia/class-run", { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        const r = (json.run ?? null) as ClassRun | null;
        setRun(r);
        const nowRunning = !!r && !r.finishedAt;
        if (wasRunning.current && !nowRunning) router.refresh();
        wasRunning.current = nowRunning;
        if (nowRunning) timer = window.setTimeout(poll, POLL_MS);
      } catch {
        if (alive) timer = window.setTimeout(poll, POLL_MS * 2);
      }
    }
    if (busy || running || run === null) void poll();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
    // Re-arm only when a run starts or stops, not on every progress update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!running, busy]);

  const queue = withDraft.filter((r) => !(skipDone && upToDate(r)));
  const mathQueue = withDraft.filter((r) => !r.mathDone);
  const stateOf = (studentId: number) => mine?.items.find((i) => i.studentId === studentId);
  const failed = mine && mine.finishedAt ? withDraft.filter((r) => stateOf(r.studentId)?.state === "error") : [];
  const counted = mine ? mine.items.filter((i) => i.state === "done" || i.state === "error").length : 0;

  async function start(job: Job, list: ClassFeedbackRow[]) {
    if (list.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/ia/class-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", classId, job, explorationIds: list.map((r) => r.explorationId) }),
      });
      const json = await res.json().catch(() => null);
      if (json?.run) setRun(json.run);
      if (!res.ok) setMessage(json?.error ?? `Could not start (${res.status}).`);
      else wasRunning.current = true;
    } catch {
      setMessage("Network error — could not reach the app.");
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    const res = await fetch("/api/ia/class-run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    });
    const json = await res.json().catch(() => null);
    if (json?.run) setRun(json.run);
    setMessage("Stopping — the students already being worked on will finish first.");
  }

  return (
    <section>
      <h2 className="text-lg font-medium">Draft feedback for the class</h2>
      <p className="mt-1 text-sm text-slate-600">
        Runs the math check and draft feedback for every student with a draft, two at a time. A math
        check already done on the same draft is reused, so you can run the math checks first and the
        feedback later. It runs in the app itself: you can leave this page and come back, as long as
        the app stays open. Nothing is sent to students: review each one on their page, then
        download the PDFs.
      </p>
      <div className="mt-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
        {otherClassRunning && (
          <p className="text-sm text-amber-800">
            A run for another class is going ({running!.items.filter((i) => i.state === "done" || i.state === "error").length} of{" "}
            {running!.items.length}). Wait for it to finish, or stop it, before starting one here.
          </p>
        )}
        {withDraft.length === 0 ? (
          <p className="text-sm text-slate-500">No drafts uploaded in this class yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <button
                type="button"
                onClick={() => start("feedback", queue)}
                disabled={busy || !!running || queue.length === 0}
                className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {running && mine?.job === "feedback"
                  ? `Generating… ${counted} of ${mine.items.length}`
                  : `Generate draft feedback for ${queue.length} student${queue.length === 1 ? "" : "s"}`}
              </button>
              <button
                type="button"
                onClick={() => start("math", mathQueue)}
                disabled={busy || !!running || mathQueue.length === 0}
                title="Only the math check, for students whose latest draft has none or whose check failed"
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium hover:bg-slate-100 disabled:opacity-50"
              >
                {running && mine?.job === "math"
                  ? `Checking the math… ${counted} of ${mine.items.length}`
                  : `Run math check for ${mathQueue.length} student${mathQueue.length === 1 ? "" : "s"} missing one`}
              </button>
              {running && mine && (
                <button
                  type="button"
                  onClick={stop}
                  disabled={running.stopRequested}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium hover:bg-slate-100 disabled:opacity-50"
                >
                  {running.stopRequested ? "Stopping…" : "Stop after the current ones"}
                </button>
              )}
              {!running && failed.length > 0 && mine && (
                <button
                  type="button"
                  onClick={() => start(mine.job, failed)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium hover:bg-slate-100"
                >
                  Retry the {failed.length} that failed
                </button>
              )}
              <label className="flex items-center gap-2 text-slate-600">
                <input type="checkbox" checked={skipDone} disabled={!!running} onChange={(e) => setSkipDone(e.target.checked)} />
                Skip students whose feedback is up to date (newer than the draft, with the current math check)
              </label>
            </div>
            {message && <p className="text-sm text-blue-700">{message}</p>}
            <p className="text-xs text-slate-500">
              Regenerating keeps your comments and checklist changes; the AI&rsquo;s parts are replaced.
            </p>
            <table className="w-full text-left text-sm">
              <tbody>
                {withDraft.map((r) => {
                  const st = stateOf(r.studentId);
                  return (
                    <tr key={r.studentId} className="border-t border-slate-200 align-top">
                      <td className="py-1.5 pr-3">
                        <Link href={`/ia/${r.studentId}`} className="underline">
                          {r.name}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-3 text-slate-500">
                        {upToDate(r)
                          ? `Feedback ${r.feedbackAt?.slice(0, 10)}`
                          : !r.feedbackAt
                            ? "No feedback yet"
                            : r.draftAt && r.feedbackAt < r.draftAt
                              ? "Feedback older than draft"
                              : r.mathState === "math-newer"
                                ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">Math check newer — regenerate</span>
                                : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">Feedback without math check</span>}
                        {" · "}
                        {r.mathDone ? "math checked" : <span className="text-amber-700">no math check</span>}
                      </td>
                      <td className="py-1.5">
                        {!st && (skipDone && upToDate(r) ? <span className="text-slate-400">Will skip</span> : null)}
                        {st?.state === "waiting" && <span className="text-slate-500">Waiting</span>}
                        {st?.state === "running" && <span className="text-blue-700">Working…</span>}
                        {st?.state === "done" && (
                          <span className={st.note ? "text-amber-700" : "text-emerald-700"}>
                            ✓ Done{st.note ? ` — ${st.note}` : ""}
                          </span>
                        )}
                        {st?.state === "error" && <span className="text-rose-700">{st.note}</span>}
                        {st?.state === "skipped" && <span className="text-slate-400">Not started (stopped)</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </section>
  );
}
