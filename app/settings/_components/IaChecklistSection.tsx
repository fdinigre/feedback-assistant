"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveIaChecklist } from "@/lib/ia/checklist-actions";

export function IaChecklistSection({ checklist }: { checklist: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(checklist);
  const [message, setMessage] = useState<string | null>(null);

  const dirty = text !== checklist;

  function save() {
    setMessage(null);
    startTransition(async () => {
      const res = await saveIaChecklist(text);
      if (res.error) setMessage(res.error);
      else {
        setMessage("Saved — applies the next time you generate IA feedback or marks.");
        router.refresh();
      }
    });
  }

  return (
    <section>
      <h2 className="text-lg font-medium">IA checklist</h2>
      <p className="mt-1 text-sm text-slate-600">
        Your personal checklist for the Mathematical Exploration. It&rsquo;s sent to the AI alongside the
        official rubric for both draft feedback and final marking, so your own priorities are applied
        every time. Leave it blank to use the rubric alone.
      </p>
      <div className="mt-3 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={
            "One point per line, e.g.\n- Personal engagement must be genuine, not a token 'I like football' intro.\n- Every graph must have labelled axes and a caption.\n- Reflection should evaluate limitations, not just restate results."
          }
          className="w-full rounded border border-slate-300 p-2 font-mono text-sm"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={pending || !dirty}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save checklist"}
          </button>
          {message && <p className="text-sm text-blue-700">{message}</p>}
        </div>
      </div>
    </section>
  );
}
