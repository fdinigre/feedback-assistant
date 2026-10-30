"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveIaCriterionNotes } from "@/lib/ia/criterion-notes-actions";
import {
  IA_NOTE_DEFAULTS,
  IA_NOTE_KEYS,
  IA_NOTE_LABELS,
  isEditedNote,
  type IaCriterionNotes,
  type IaNoteKey,
} from "@/lib/ia/criterion-notes";

export function IaCriterionNotesSection({ notes }: { notes: IaCriterionNotes }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<IaCriterionNotes>(notes);
  const [message, setMessage] = useState<string | null>(null);

  const dirty = IA_NOTE_KEYS.some((k) => draft[k].trim() !== notes[k].trim());

  function save() {
    setMessage(null);
    startTransition(async () => {
      const res = await saveIaCriterionNotes(draft);
      if (res.error) setMessage(res.error);
      else {
        setMessage("Saved — applies the next time you generate IA feedback or marks.");
        router.refresh();
      }
    });
  }

  return (
    <section>
      <h2 className="text-lg font-medium">IA criterion notes</h2>
      <p className="mt-1 text-sm text-slate-600">
        The IB guide&rsquo;s own clarifications of how to read each Exploration criterion. They are
        sent to the AI with your annotated rubric and checklist, for both draft feedback and final
        marking. Each box starts with the guide&rsquo;s wording; edit it freely, or reset it. Where your
        rubric or checklist is more specific, the AI follows yours.
      </p>
      <div className="mt-3 space-y-4">
        {IA_NOTE_KEYS.map((k: IaNoteKey) => {
          const edited = isEditedNote(k, draft[k]);
          return (
            <div key={k} className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-medium">{IA_NOTE_LABELS[k]}</h3>
                <span
                  className={
                    "rounded px-2 py-0.5 text-xs " +
                    (edited ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-700")
                  }
                >
                  {edited ? "Edited by you" : "IB guide wording"}
                </span>
                {edited && (
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, [k]: IA_NOTE_DEFAULTS[k] })}
                    className="text-xs text-blue-700 underline"
                  >
                    Reset to IB guide
                  </button>
                )}
              </div>
              <textarea
                aria-label={`Notes for ${IA_NOTE_LABELS[k]}`}
                value={draft[k]}
                onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                rows={Math.min(14, Math.max(4, draft[k].split("\n").length + 1))}
                className="w-full rounded border border-slate-300 bg-white p-2 text-sm"
              />
            </div>
          );
        })}
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={pending || !dirty}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save notes"}
          </button>
          {message && <p className="text-sm text-blue-700">{message}</p>}
        </div>
      </div>
    </section>
  );
}
