"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Approves every draft report for the assessment in one click.
 *
 * Approval is what a teacher signs their name to, so this states plainly how
 * many reports it covers and that it approves them unread — and it only appears
 * when there is something to approve.
 */
export function ApproveAllReports({
  assessmentId,
  draftCount,
}: {
  assessmentId: number;
  draftCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  if (draftCount === 0) return null;

  async function approveAll() {
    const message = [
      `Approve ${draftCount} report${draftCount === 1 ? "" : "s"} without opening them?`,
      "",
      "They'll be marked approved and their students marked reviewed, using the text as it stands now.",
      "",
      "You can still edit any report afterwards.",
    ].join("\n");
    if (!window.confirm(message)) return;

    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/review/report/approve-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId }),
      });
      const data = (await res.json()) as {
        approved?: number;
        withoutReport?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not approve the reports.");

      const parts = [`Approved ${data.approved ?? 0}.`];
      if (data.withoutReport) {
        parts.push(`${data.withoutReport} student(s) have no report yet — generate those first.`);
      }
      setResult(parts.join(" "));
      router.refresh();
    } catch (err) {
      setResult(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={approveAll}
        disabled={busy}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
      >
        {busy ? "Approving…" : `Approve all ${draftCount} report${draftCount === 1 ? "" : "s"}`}
      </button>
      {result && <span className="text-xs text-slate-600">{result}</span>}
    </div>
  );
}
