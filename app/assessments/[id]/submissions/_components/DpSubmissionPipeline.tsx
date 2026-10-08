"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Endpoint = "transcribe" | "grade-dp" | "report";

const LABEL: Record<Endpoint, string> = {
  transcribe: "Run transcription",
  "grade-dp": "Run grading",
  report: "Generate report",
};

const RUNNING_LABEL: Record<Endpoint, string> = {
  transcribe: "Transcribing…",
  "grade-dp": "Grading…",
  report: "Generating…",
};

/**
 * Batch-adjacent pipeline triggers for one DP submission, shown on the submissions list
 * (spec item 4): transcription and report reuse the exact same endpoints as MYP; grading calls
 * /api/pipeline/grade-dp (owned by another agent — 409 means unresolved illegible flags, same
 * contract as MYP grading).
 */
export function DpSubmissionPipeline({ submissionId }: { submissionId: number }) {
  const router = useRouter();
  const [running, setRunning] = useState<Endpoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unresolved, setUnresolved] = useState<string[] | null>(null);

  async function run(endpoint: Endpoint) {
    setRunning(endpoint);
    setError(null);
    setUnresolved(null);
    try {
      const res = await fetch(`/api/pipeline/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      });
      if (res.status === 409) {
        const json = await res.json().catch(() => null);
        const flags = Array.isArray(json?.unresolvedFlags)
          ? json.unresolvedFlags.map((f: unknown) => (typeof f === "string" ? f : JSON.stringify(f)))
          : [json?.error ?? "Grading is blocked by unresolved flags."];
        setUnresolved(flags);
        return;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError((json && json.error) ?? `Failed to run ${endpoint} (${res.status}).`);
        return;
      }
      router.refresh();
    } catch {
      setError(`Could not reach the ${endpoint} endpoint.`);
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {(["transcribe", "grade-dp", "report"] as Endpoint[]).map((endpoint) => (
          <button
            key={endpoint}
            type="button"
            onClick={() => run(endpoint)}
            disabled={running !== null}
            className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100 disabled:opacity-50"
          >
            {running === endpoint ? RUNNING_LABEL[endpoint] : LABEL[endpoint]}
          </button>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {unresolved && (
        <div className="mt-1 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          <p className="font-medium">Unresolved flags:</p>
          <ul className="mt-0.5 list-inside list-disc">
            {unresolved.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
          <Link href={`/submissions/${submissionId}`} className="mt-1 inline-block font-medium underline">
            Resolve them on the review page
          </Link>
        </div>
      )}
    </div>
  );
}
