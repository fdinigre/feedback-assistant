"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveIaItemMeanings } from "@/lib/ia/item-meanings-actions";
import type { RubricCriterion } from "@/lib/ia/rubric-items";

/**
 * What each rubric checklist item means to the teacher. The AI judges an item by its
 * meaning when there is one, and the checklist shows it under the item. The same
 * meanings can be edited from a student's checklist (✎).
 */
export function IaItemMeaningsSection({
  rubric,
  meanings,
}: {
  rubric: RubricCriterion[];
  meanings: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Record<string, string>>(meanings);
  const [message, setMessage] = useState<string | null>(null);

  const changed = Object.fromEntries(
    [...new Set([...Object.keys(draft), ...Object.keys(meanings)])]
      .filter((id) => (draft[id] ?? "").trim() !== (meanings[id] ?? "").trim())
      .map((id) => [id, draft[id] ?? ""])
  );
  const dirty = Object.keys(changed).length > 0;
  const definedIn = (c: RubricCriterion) => c.bands.flatMap((b) => b.items).filter((i) => (draft[i.id] ?? "").trim()).length;

  function save() {
    setMessage(null);
    startTransition(async () => {
      const res = await saveIaItemMeanings(changed);
      if (res.error) setMessage(res.error);
      else {
        setMessage("Saved — used from the next draft feedback you generate.");
        router.refresh();
      }
    });
  }

  if (rubric.length === 0) return null;
  return (
    <section>
      <h2 className="text-lg font-medium">IA checklist: what each item means</h2>
      <p className="mt-1 text-sm text-slate-600">
        Say what a checklist item means to you, in your own words. The AI judges the item by your
        meaning, and the checklist shows it under the item. Leave an item blank to use its wording
        alone. You can also edit a meaning from any student&rsquo;s checklist with ✎.
      </p>
      <div className="mt-3 space-y-2">
        {rubric.map((c) => (
          <details key={c.criterion} className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              {c.criterion} — {c.title}{" "}
              <span className="font-normal text-slate-500">
                ({definedIn(c)} of {c.bands.flatMap((b) => b.items).length} defined)
              </span>
            </summary>
            <div className="mt-2 space-y-3">
              {c.bands
                .filter((b) => b.items.length > 0)
                .map((b) => (
                  <div key={b.level}>
                    <p className="text-xs font-semibold text-slate-600">
                      Level {b.level} — <span className="font-normal">{b.descriptor}</span>
                    </p>
                    <ul className="mt-1 space-y-2">
                      {b.items.map((i) => (
                        <li key={i.id}>
                          <label htmlFor={`m-${i.id}`} className="block text-sm text-slate-800">
                            <span className="mr-1 text-xs text-slate-400">{i.id}</span>
                            {i.text}
                          </label>
                          <textarea
                            id={`m-${i.id}`}
                            value={draft[i.id] ?? ""}
                            onChange={(e) => setDraft((prev) => ({ ...prev, [i.id]: e.target.value }))}
                            rows={1}
                            placeholder="What this means to you (optional)"
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          </details>
        ))}
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={pending || !dirty}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save meanings"}
          </button>
          {message && <p className="text-sm text-blue-700">{message}</p>}
        </div>
      </div>
    </section>
  );
}
