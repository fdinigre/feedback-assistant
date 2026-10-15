"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { Criterion } from "@/lib/types";

type Paper = { submissionId: number; studentName: string };
type Outcome = { ok: true } | { ok: false; message: string };

/** Up to this many papers at once — the same pace as the class pipeline. */
const CONCURRENCY = 3;

/**
 * A criterion added after papers were graded: each of those papers gets its level
 * judged from the marking on file and the student's work, without the points being
 * marked again. Shown only while some graded paper has no level for it.
 */
export function GradeAddedCriterion({ criterion, papers }: { criterion: Criterion; papers: Paper[] }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<number, Outcome>>({});
  const stopRef = useRef(false);

  async function run() {
    stopRef.current = false;
    setRunning(true);
    setOutcomes({});
    let cursor = 0;
    async function worker() {
      while (!stopRef.current) {
        const paper = papers[cursor++];
        if (!paper) return;
        let outcome: Outcome;
        try {
          const res = await fetch("/api/pipeline/grade-criterion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ submissionId: paper.submissionId, criterion }),
          });
          const json = await res.json().catch(() => null);
          outcome = res.ok
            ? { ok: true }
            : {
                ok: false,
                message:
                  res.status === 409
                    ? "An unreadable [?] is still open — fix it on the review page."
                    : (json?.error as string | undefined) ?? `Failed (${res.status}).`,
              };
        } catch (err) {
          outcome = { ok: false, message: (err as Error).message };
        }
        setOutcomes((o) => ({ ...o, [paper.submissionId]: outcome }));
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, papers.length) }, () => worker()));
    setRunning(false);
    router.refresh();
  }

  const done = Object.values(outcomes).filter((o) => o.ok).length;
  const failed = papers.filter((p) => outcomes[p.submissionId] && !outcomes[p.submissionId].ok);
  const n = papers.length;

  return (
    <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/60 p-4">
      <p className="text-sm text-slate-800">
        <span className="font-medium">Criterion {criterion} was added after grading.</span>{" "}
        {n} graded paper{n === 1 ? " has" : "s have"} no Criterion {criterion} level yet. It is judged from the
        marking already done and the student&apos;s work — the marks are not graded again.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {running
            ? `Grading Criterion ${criterion}… ${done + failed.length}/${n}`
            : `Grade Criterion ${criterion} for ${n} paper${n === 1 ? "" : "s"}`}
        </button>
        {running && (
          <button
            type="button"
            onClick={() => (stopRef.current = true)}
            className="text-xs text-slate-600 underline underline-offset-2"
          >
            Stop after the ones under way
          </button>
        )}
      </div>
      {!running && done > 0 && (
        <p className="mt-2 text-xs text-emerald-700">
          Criterion {criterion} graded for {done} paper{done === 1 ? "" : "s"} — check each level on the review
          page. Reports written before it don&apos;t mention it; write them again to include it.
        </p>
      )}
      {failed.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-xs text-red-700">
          {failed.map((p) => (
            <li key={p.submissionId}>
              <Link href={`/submissions/${p.submissionId}`} className="font-medium underline underline-offset-2">
                {p.studentName}
              </Link>
              : {(outcomes[p.submissionId] as { message: string }).message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
