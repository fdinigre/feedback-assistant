"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Asks the AI to write (or rewrite) the learning targets from the marking, then
 * refreshes the page so each card shows its target. Nothing is written until
 * this is clicked, so a student's page never costs an AI call just by opening.
 */
export function WriteTargetsButton({
  studentId,
  hasTargets,
  generatedAt,
}: {
  studentId: number;
  hasTargets: boolean;
  generatedAt: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function write() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/students/${studentId}/skill-targets${hasTargets ? "?force=1" : ""}`, {
        method: "POST",
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to write learning targets");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={write}
        disabled={loading}
        className="shrink-0 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {loading ? "Writing..." : hasTargets ? "Rewrite all targets" : "Write learning targets"}
      </button>
      {generatedAt && !loading && (
        <span className="text-xs text-slate-400">
          Written {new Date(generatedAt).toLocaleString()}
        </span>
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
