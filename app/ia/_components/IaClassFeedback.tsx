"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export type ClassFeedbackRow = {
  studentId: number;
  name: string;
  explorationId: number | null;
  draftAt: string | null; // latest draft upload
  feedbackAt: string | null; // latest draft feedback (with criteria)
  mathDone: boolean; // the latest draft has a math check
};

type Job = "feedback" | "math";
const ENDPOINT: Record<Job, string> = {
  feedback: "/api/ia/draft-feedback/generate",
  math: "/api/ia/math-check",
};

type RunState = "waiting" | "running" | "done" | "error" | "skipped";

/** How many students are worked on at once: each one is a math check plus a feedback call. */
const AT_ONCE = 2;

function upToDate(r: ClassFeedbackRow): boolean {
  return !!r.draftAt && !!r.feedbackAt && r.feedbackAt >= r.draftAt;
}

/**
 * Runs draft feedback (math check, then feedback) for every student in the class
 * who has a draft, two at a time, through the same route as the per-student
 * button. A failure is shown and the run carries on; Stop lets the ones already
 * running finish and starts no more. The page must stay open while it runs.
 */
export function IaClassFeedback({ rows }: { rows: ClassFeedbackRow[] }) {
  const router = useRouter();
  const withDraft = rows.filter((r) => r.draftAt && r.explorationId != null);
  const [skipDone, setSkipDone] = useState(true);
  const [state, setState] = useState<Record<number, { s: RunState; error?: string }>>({});
  const [running, setRunning] = useState<Job | null>(null);
  const stopRef = useRef(false);

  const queue = withDraft.filter((r) => !(skipDone && upToDate(r)));
  const mathQueue = withDraft.filter((r) => !r.mathDone);
  const doneCount = Object.values(state).filter((v) => v.s === "done").length;
  const errorCount = Object.values(state).filter((v) => v.s === "error").length;

  async function runOne(r: ClassFeedbackRow, job: Job) {
    setState((p) => ({ ...p, [r.studentId]: { s: "running" } }));
    try {
      const res = await fetch(ENDPOINT[job], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ explorationId: r.explorationId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setState((p) => ({ ...p, [r.studentId]: { s: "error", error: (json && json.error) ?? `Failed (${res.status}).` } }));
      } else {
        const mathError = json?.output?.content?.mathCheckError as string | undefined;
        setState((p) => ({
          ...p,
          [r.studentId]: mathError ? { s: "done", error: `Feedback done, but the math check failed: ${mathError}` } : { s: "done" },
        }));
      }
    } catch {
      setState((p) => ({ ...p, [r.studentId]: { s: "error", error: "Network error — could not reach the app." } }));
    }
  }

  const [lastJob, setLastJob] = useState<Job>("feedback");

  async function runAll(job: Job, list: ClassFeedbackRow[]) {
    if (list.length === 0) return;
    stopRef.current = false;
    setRunning(job);
    setLastJob(job);
    setState((p) => {
      const next = { ...p };
      for (const r of list) next[r.studentId] = { s: "waiting" };
      return next;
    });
    let i = 0;
    async function worker() {
      while (!stopRef.current && i < list.length) {
        const r = list[i++];
        await runOne(r, job);
      }
    }
    await Promise.all(Array.from({ length: Math.min(AT_ONCE, list.length) }, worker));
    // Anything still waiting was stopped before it started.
    setState((p) => {
      const next = { ...p };
      for (const r of list) if (next[r.studentId]?.s === "waiting") next[r.studentId] = { s: "skipped" };
      return next;
    });
    setRunning(null);
    router.refresh();
  }

  const failed = withDraft.filter((r) => state[r.studentId]?.s === "error");

  return (
    <section>
      <h2 className="text-lg font-medium">Draft feedback for the class</h2>
      <p className="mt-1 text-sm text-slate-600">
        Runs the math check and draft feedback for every student with a draft, two at a time. A math
        check already done on the same draft is reused, so you can run the math checks first and the
        feedback later. Each student takes a few minutes, so keep this page open until it finishes.
        Nothing is sent to students: review each one on their page, then download the PDFs.
      </p>
      <div className="mt-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
        {withDraft.length === 0 ? (
          <p className="text-sm text-slate-500">No drafts uploaded in this class yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <button
                type="button"
                onClick={() => runAll("feedback", queue)}
                disabled={!!running || queue.length === 0}
                className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {running === "feedback"
                  ? `Generating… ${doneCount + errorCount} of ${Object.values(state).filter((v) => v.s !== "skipped").length}`
                  : `Generate draft feedback for ${queue.length} student${queue.length === 1 ? "" : "s"}`}
              </button>
              <button
                type="button"
                onClick={() => runAll("math", mathQueue)}
                disabled={!!running || mathQueue.length === 0}
                title="Only the math check, for students whose latest draft has none or whose check failed"
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium hover:bg-slate-100 disabled:opacity-50"
              >
                {running === "math"
                  ? `Checking the math… ${doneCount + errorCount} of ${Object.values(state).filter((v) => v.s !== "skipped").length}`
                  : `Run math check for ${mathQueue.length} student${mathQueue.length === 1 ? "" : "s"} missing one`}
              </button>
              {running && (
                <button
                  type="button"
                  onClick={() => (stopRef.current = true)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium hover:bg-slate-100"
                >
                  Stop after the current ones
                </button>
              )}
              {!running && failed.length > 0 && (
                <button
                  type="button"
                  onClick={() => runAll(lastJob, failed)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium hover:bg-slate-100"
                >
                  Retry the {failed.length} that failed
                </button>
              )}
              <label className="flex items-center gap-2 text-slate-600">
                <input type="checkbox" checked={skipDone} disabled={!!running} onChange={(e) => setSkipDone(e.target.checked)} />
                Skip students whose feedback is newer than their draft
              </label>
            </div>
            <p className="text-xs text-slate-500">
              Regenerating keeps your comments and checklist changes; the AI&rsquo;s parts are replaced.
            </p>
            <table className="w-full text-left text-sm">
              <tbody>
                {withDraft.map((r) => {
                  const st = state[r.studentId];
                  return (
                    <tr key={r.studentId} className="border-t border-slate-200 align-top">
                      <td className="py-1.5 pr-3">
                        <Link href={`/ia/${r.studentId}`} className="underline">
                          {r.name}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-3 text-slate-500">
                        {upToDate(r) ? `Feedback ${r.feedbackAt?.slice(0, 10)}` : r.feedbackAt ? "Feedback older than draft" : "No feedback yet"}
                        {" · "}
                        {r.mathDone ? "math checked" : <span className="text-amber-700">no math check</span>}
                      </td>
                      <td className="py-1.5">
                        {!st && (skipDone && upToDate(r) ? <span className="text-slate-400">Will skip</span> : null)}
                        {st?.s === "waiting" && <span className="text-slate-500">Waiting</span>}
                        {st?.s === "running" && <span className="text-blue-700">Working…</span>}
                        {st?.s === "done" && (
                          <span className={st.error ? "text-amber-700" : "text-emerald-700"}>
                            ✓ Done{st.error ? ` — ${st.error}` : ""}
                          </span>
                        )}
                        {st?.s === "error" && <span className="text-rose-700">{st.error}</span>}
                        {st?.s === "skipped" && <span className="text-slate-400">Not started (stopped)</span>}
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
