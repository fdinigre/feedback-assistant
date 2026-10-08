"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MarkingInstructionRow, Programme } from "@/lib/types";
import { addMarkingInstruction } from "@/lib/marking/actions";

type ScopeChoice = "assessment" | "programme" | "all";

export function MarkingNotes({
  assessmentId,
  programme,
  applicable,
}: {
  assessmentId: number;
  programme: Programme;
  applicable: MarkingInstructionRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [scope, setScope] = useState<ScopeChoice>("assessment");
  const [message, setMessage] = useState<string | null>(null);

  function save() {
    if (!text.trim()) {
      setMessage("Write the instruction first.");
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const res = await addMarkingInstruction({
        text,
        scope: scope === "assessment" ? "assessment" : "standing",
        programme: scope === "programme" ? programme : null,
        assessmentId: scope === "assessment" ? assessmentId : null,
      });
      if (res.error) {
        setMessage(res.error);
      } else {
        setText("");
        setMessage("Saved — run grading again to apply it (here and on future papers).");
        router.refresh();
      }
    });
  }

  function scopeLabel(row: MarkingInstructionRow): string {
    if (row.scope === "assessment") return "this assessment";
    return row.programme ? `all ${row.programme}` : "all assessments";
  }

  return (
    <details className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-slate-900">
        Marking notes{applicable.length > 0 ? ` (${applicable.length} applied)` : ""}
      </summary>
      <p className="mt-2 text-sm text-slate-600">
        Noticed the grader getting something wrong again and again? Write the correction here — it&rsquo;s
        added to the marking instructions and applies the next time you run grading, on this paper and
        the ones you choose.
      </p>

      {applicable.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {applicable.map((row) => (
            <li key={row.id} className="rounded border border-slate-200 bg-white px-3 py-1.5">
              <span className="text-slate-800">{row.text}</span>{" "}
              <span className="text-xs text-slate-400">· {scopeLabel(row)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="e.g. Do not give the answer mark when the working is crossed out, even if the value is right."
          className="w-full rounded border border-slate-300 p-2 text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-600">Apply to</label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as ScopeChoice)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="assessment">this assessment only</option>
            <option value="programme">all my {programme} assessments</option>
            <option value="all">all my assessments</option>
          </select>
          <button
            onClick={save}
            disabled={pending}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Add note"}
          </button>
        </div>
        {message && <p className="text-sm text-blue-700">{message}</p>}
      </div>
    </details>
  );
}
