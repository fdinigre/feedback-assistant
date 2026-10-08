"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MarkingInstructionRow } from "@/lib/types";
import { addMarkingInstruction, deleteMarkingInstructionAction } from "@/lib/marking/actions";

export function MarkingInstructionsSection({
  rows,
  assessmentTitles,
}: {
  rows: MarkingInstructionRow[];
  assessmentTitles: Record<number, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [programme, setProgramme] = useState<"all" | "MYP" | "DP">("all");
  const [message, setMessage] = useState<string | null>(null);

  const standing = rows.filter((r) => r.scope === "standing");
  const perAssessment = rows.filter((r) => r.scope === "assessment");

  function addStanding() {
    if (!text.trim()) {
      setMessage("Write the instruction first.");
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const res = await addMarkingInstruction({
        text,
        scope: "standing",
        programme: programme === "all" ? null : programme,
      });
      if (res.error) setMessage(res.error);
      else {
        setText("");
        router.refresh();
      }
    });
  }

  function remove(id: number) {
    startTransition(async () => {
      await deleteMarkingInstructionAction(id);
      router.refresh();
    });
  }

  function Row({ row, label }: { row: MarkingInstructionRow; label: string }) {
    return (
      <li className="flex items-start justify-between gap-3 rounded border border-slate-200 bg-white px-3 py-2">
        <span className="text-sm text-slate-800">
          {row.text} <span className="text-xs text-slate-400">· {label}</span>
        </span>
        <button
          onClick={() => remove(row.id)}
          disabled={pending}
          className="shrink-0 text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
        >
          Delete
        </button>
      </li>
    );
  }

  return (
    <section>
      <h2 className="text-lg font-medium">Marking instructions</h2>
      <p className="mt-1 text-sm text-slate-600">
        Standing corrections the grader applies to every run — the same notes you can add from a
        student&rsquo;s review page. Per-assessment notes are added from that assessment&rsquo;s review page.
      </p>

      <div className="mt-3 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="e.g. Communication (C) is almost always within one level of Criterion A."
          className="w-full rounded border border-slate-300 p-2 text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-600">Apply to</label>
          <select
            value={programme}
            onChange={(e) => setProgramme(e.target.value as "all" | "MYP" | "DP")}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="all">all my assessments</option>
            <option value="MYP">all my MYP assessments</option>
            <option value="DP">all my DP assessments</option>
          </select>
          <button
            onClick={addStanding}
            disabled={pending}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Add standing note
          </button>
        </div>
        {message && <p className="text-sm text-blue-700">{message}</p>}
      </div>

      {standing.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-slate-700">Standing</h3>
          <ul className="mt-2 space-y-1">
            {standing.map((r) => (
              <Row key={r.id} row={r} label={r.programme ? `all ${r.programme}` : "all assessments"} />
            ))}
          </ul>
        </div>
      )}

      {perAssessment.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-slate-700">Per-assessment</h3>
          <ul className="mt-2 space-y-1">
            {perAssessment.map((r) => (
              <Row
                key={r.id}
                row={r}
                label={r.assessment_id ? assessmentTitles[r.assessment_id] ?? "assessment" : "assessment"}
              />
            ))}
          </ul>
        </div>
      )}

      {rows.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">
          No marking notes yet. Add one above, or from any student&rsquo;s review page.
        </p>
      )}
    </section>
  );
}
