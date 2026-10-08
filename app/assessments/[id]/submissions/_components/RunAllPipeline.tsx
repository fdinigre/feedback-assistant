"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Programme } from "@/lib/types";

export type BatchItem = {
  submissionId: number;
  studentName: string;
  status: string; // uploaded | assigned | transcribed | graded | reviewed | absent
  hasReport: boolean;
  /** Whether this paper's mistakes have been sorted into the error mechanisms. */
  hasErrorTags: boolean;
};

type Stage = "transcribe" | "grade" | "report" | "errorTags";
type Phase = "queued" | "working" | "done" | "flags" | "error" | "skipped";

const PHASE_CLASS: Record<Phase, string> = {
  queued: "bg-slate-100 text-slate-600",
  working: "bg-amber-100 text-amber-800",
  done: "bg-emerald-100 text-emerald-800",
  flags: "bg-rose-100 text-rose-800",
  error: "bg-rose-100 text-rose-800",
  skipped: "bg-slate-100 text-slate-400",
};

async function post(url: string, submissionId: number): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submissionId }),
  });
}

export function RunAllPipeline({
  items,
  programme,
}: {
  items: BatchItem[];
  programme: Programme;
}) {
  const router = useRouter();
  const gradeUrl = programme === "DP" ? "/api/pipeline/grade-dp" : "/api/pipeline/grade";
  const [activeStage, setActiveStage] = useState<Stage | null>(null);
  const [phases, setPhases] = useState<Record<number, Phase>>({});
  const [detail, setDetail] = useState<Record<number, string>>({});
  const stopRef = useRef(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  if (items.length === 0) return null;

  // Which submissions each stage will act on (the rest are skipped as already done / not ready).
  const toTranscribe = items.filter((i) => i.status === "assigned" || i.status === "uploaded");
  const toGrade = items.filter((i) => i.status === "transcribed");
  const toReport = items.filter(
    (i) => (i.status === "graded" || i.status === "reviewed") && !i.hasReport
  );
  // Reads the marking already written, so it only needs the paper to be graded.
  const toTag = items.filter(
    (i) => (i.status === "graded" || i.status === "reviewed") && !i.hasErrorTags
  );
  // Anything already transcribed can be run again — including work already graded or
  // already reported, which the staged buttons deliberately skip. That is the case this
  // picker exists for: the markscheme, the rubric, its descriptors or the way reports
  // are written changed after a class was marked.
  const rerunnable = items.filter(
    (i) => i.status === "transcribed" || i.status === "graded" || i.status === "reviewed"
  );
  const chosen = rerunnable.filter((i) => selected.has(i.submissionId));
  // A report needs marks to describe, so only graded work can have one written.
  const chosenForReport = chosen.filter((i) => i.status === "graded" || i.status === "reviewed");

  function toggleSelected(submissionId: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(submissionId)) next.delete(submissionId);
      else next.add(submissionId);
      return next;
    });
  }

  function setPhase(id: number, phase: Phase, msg?: string) {
    setPhases((p) => ({ ...p, [id]: phase }));
    setDetail((d) => ({ ...d, [id]: msg ?? "" }));
  }

  // Run up to this many students at once. Each `claude` call is its own process, so
  // concurrency multiplies throughput; kept modest to stay within subscription limits.
  const CONCURRENCY = 3;

  async function processItem(stage: Stage, item: BatchItem) {
    const id = item.submissionId;
    setPhase(id, "working");
    try {
      if (stage === "transcribe") {
        const r = await post("/api/pipeline/transcribe", id);
        setPhase(id, r.ok ? "done" : "error", r.ok ? "" : `Failed (${r.status}).`);
      } else if (stage === "grade") {
        const r = await post(gradeUrl, id);
        if (r.status === 409) {
          setPhase(id, "flags", "Illegible spots — resolve on the Review page, then grade again.");
        } else {
          setPhase(id, r.ok ? "done" : "error", r.ok ? "" : `Failed (${r.status}).`);
        }
      } else if (stage === "errorTags") {
        const r = await post("/api/pipeline/error-tags", id);
        setPhase(id, r.ok ? "done" : "error", r.ok ? "" : `Failed (${r.status}).`);
      } else {
        const r = await post("/api/pipeline/report", id);
        setPhase(id, r.ok ? "done" : "error", r.ok ? "" : `Failed (${r.status}).`);
      }
    } catch (err) {
      setPhase(id, "error", (err as Error).message);
    }
  }

  async function runStage(stage: Stage, eligible: BatchItem[]) {
    stopRef.current = false;
    setActiveStage(stage);
    // Mark eligible as queued, everything else as skipped for this stage.
    const init: Record<number, Phase> = {};
    for (const i of items) init[i.submissionId] = eligible.includes(i) ? "queued" : "skipped";
    setPhases(init);
    setDetail({});

    // Concurrency pool: workers pull from a shared cursor until the queue drains.
    let cursor = 0;
    async function worker() {
      while (!stopRef.current) {
        const item = eligible[cursor++];
        if (!item) return;
        await processItem(stage, item);
      }
    }
    const workerCount = Math.min(CONCURRENCY, eligible.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    setActiveStage(null);
    router.refresh();
  }

  const busy = activeStage !== null;
  const doneCount = items.filter((i) => phases[i.submissionId] === "done").length;
  const flagCount = items.filter((i) => phases[i.submissionId] === "flags").length;
  const errorCount = items.filter((i) => phases[i.submissionId] === "error").length;
  const showList = Object.keys(phases).length > 0;

  /**
   * One row per stage. Exactly one is normally live — the stage you can do now
   * — so the button's own label carries the count and the state rather than
   * making you read it off a number in brackets.
   */
  const stageRow = (
    stage: Stage,
    index: number,
    verb: string,
    doneLabel: string,
    waitingFor: string | null,
    eligible: BatchItem[],
    note: string
  ) => {
    const live = eligible.length > 0;
    const label =
      activeStage === stage
        ? "Running…"
        : live
          ? `${verb} ${eligible.length}`
          : waitingFor
            ? `${verb} — waiting on ${waitingFor}`
            : doneLabel;
    return (
      <li className="flex flex-wrap items-center gap-4">
        <span
          className={
            live
              ? "w-5 font-display text-xl font-bold text-slate-900"
              : "w-5 font-display text-xl font-bold text-slate-400"
          }
        >
          {index}
        </span>
        <button
          onClick={() => runStage(stage, eligible)}
          disabled={busy || !live}
          className="min-w-[13rem] rounded-md bg-blue-600 px-4 py-2.5 text-left text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:border disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
        >
          {label}
        </button>
        <span className="flex-[1_1_16rem] text-sm text-slate-700">{note}</span>
      </li>
    );
  };

  return (
    <div className="mt-5 rounded-lg border border-slate-200 bg-white p-7">
      <h2 className="text-xl font-semibold">Run the class in stages</h2>
      <p className="mt-1 max-w-[64ch] text-[15px] text-slate-700">
        One stage for everyone, then check your work, then the next. A few students run at once, so
        leave this tab open while a stage is going. Students already through a stage are skipped.
      </p>

      <ol className="mt-6 space-y-3.5">
        {stageRow(
          "transcribe",
          1,
          "Transcribe",
          "Transcribe · all done",
          null,
          toTranscribe,
          "Then open a student's Review page to fix anything it could not read."
        )}
        {stageRow(
          "grade",
          2,
          "Grade",
          "Grade · all done",
          toTranscribe.length > 0 ? "transcription" : null,
          toGrade,
          "Then review the marks on each paper. Levels stay provisional until you do."
        )}
        {stageRow(
          "report",
          3,
          "Write reports for",
          "Reports · all written",
          toGrade.length > 0 ? "grading" : null,
          toReport,
          "Writes the report and the Toddle comment for each."
        )}
        {stageRow(
          "errorTags",
          4,
          "Sort the mistakes on",
          "Mistakes · all sorted",
          toGrade.length > 0 ? "grading" : null,
          toTag,
          "Reads the marking you already have and sorts what went wrong, and in which core skill, onto each student's page. Nothing is re-marked."
        )}
      </ol>

      {/* Uncontrolled: <details> already owns its open state, and React does not
          reliably round-trip a controlled `open` through the toggle event, which
          left this stuck shut. */}
      {rerunnable.length > 0 && (
        <details className="mt-7 border-t border-slate-100 pt-5">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">
            Run again — pick students ({rerunnable.length} available)
          </summary>
          <div className="mt-3">
              <p className="max-w-[70ch] text-sm leading-relaxed text-slate-700">
                For work that has already been through a stage, which the buttons above skip. Grading
                again replaces the AI&rsquo;s marks, evidence and levels, and keeps the marks you
                saved, the levels you set on B/C/D and the descriptors you ticked. Writing the report
                again replaces its text — including one you had approved, which goes back to draft.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(new Set(rerunnable.map((i) => i.submissionId)))}
                  className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => runStage("grade", chosen)}
                  disabled={busy || chosen.length === 0}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {activeStage === "grade" ? "Grading…" : `Grade ${chosen.length} selected`}
                </button>
                <button
                  type="button"
                  onClick={() => runStage("report", chosenForReport)}
                  disabled={busy || chosenForReport.length === 0}
                  title={
                    chosen.length !== chosenForReport.length
                      ? "Students who have not been graded yet have nothing to report on."
                      : undefined
                  }
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {activeStage === "report"
                    ? "Writing reports…"
                    : `Write reports for ${chosenForReport.length} selected`}
                </button>
              </div>
              <ul className="mt-2 grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
                {rerunnable.map((i) => (
                  <li key={i.submissionId}>
                    <label className="flex items-center gap-2 py-0.5 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={selected.has(i.submissionId)}
                        onChange={() => toggleSelected(i.submissionId)}
                        disabled={busy}
                        className="h-3.5 w-3.5 accent-slate-900"
                      />
                      <span>{i.studentName}</span>
                      <span className="text-xs text-slate-400">{i.status}</span>
                    </label>
                  </li>
                ))}
              </ul>
          </div>
        </details>
      )}

      {busy && (
        <button
          onClick={() => (stopRef.current = true)}
          className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Stop after current student
        </button>
      )}

      {showList && (
        <div className="mt-3">
          <p className="text-sm text-slate-600">
            {doneCount} done{flagCount > 0 ? ` · ${flagCount} need review` : ""}
            {errorCount > 0 ? ` · ${errorCount} errored` : ""}
          </p>
          <ul className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200">
            {items.map((i) => {
              const phase = phases[i.submissionId] ?? "queued";
              if (phase === "skipped") return null;
              return (
                <li
                  key={i.submissionId}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  {/* "Needs review" and "Error" are resolved on the paper, so every
                      name opens it. */}
                  <Link
                    href={`/submissions/${i.submissionId}`}
                    className="font-medium text-slate-800 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-500"
                  >
                    {i.studentName}
                  </Link>
                  <span className="flex items-center gap-2">
                    {detail[i.submissionId] && (
                      <span className="text-xs text-slate-500">{detail[i.submissionId]}</span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${PHASE_CLASS[phase]}`}
                    >
                      {phase === "working"
                        ? activeStage === "transcribe"
                          ? "Transcribing…"
                          : activeStage === "grade"
                            ? "Grading…"
                            : activeStage === "errorTags"
                              ? "Sorting…"
                              : "Writing report…"
                        : phase === "done"
                          ? "Done ✓"
                          : phase === "flags"
                            ? "Needs review"
                            : phase === "error"
                              ? "Error"
                              : "Queued"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
