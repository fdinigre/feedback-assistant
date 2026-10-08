"use client";

import { useState } from "react";
import { injectName } from "@/lib/render/names";
import type { StudentInsights } from "@/lib/students/insights";

export function AiDigestPanel({
  studentId,
  studentName,
  pseudonym,
  initial,
}: {
  studentId: number;
  studentName: string;
  pseudonym: string;
  initial: StudentInsights | null;
}) {
  const [insights, setInsights] = useState<StudentInsights | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/students/${studentId}/insights`, { method: "POST" });
      const body = (await res.json()) as StudentInsights | { error: string };
      if (!res.ok) {
        throw new Error("error" in body ? body.error : `Request failed (${res.status})`);
      }
      setInsights(body as StudentInsights);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate digest");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          AI Digest
        </h3>
        <button
          onClick={generate}
          disabled={loading}
          className="shrink-0 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? "Generating..." : insights ? "Regenerate" : "Generate AI digest"}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {insights ? (
        <div className="mt-3">
          <p className="whitespace-pre-wrap text-sm text-slate-800">
            {injectName(insights.digest, studentName, pseudonym)}
          </p>
          <p className="mt-3 text-xs text-slate-400">
            Generated {new Date(insights.generatedAt).toLocaleString()}
          </p>
        </div>
      ) : (
        !loading && (
          <p className="mt-2 text-sm text-slate-500">
            No digest yet. Generate one to summarize recurring error patterns from this
            student&rsquo;s grading evidence and reports.
          </p>
        )
      )}
    </div>
  );
}
