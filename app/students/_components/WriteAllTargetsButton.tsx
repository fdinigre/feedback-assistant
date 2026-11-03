"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Needing = { needing: { id: number; name: string }[]; withMistakes: number };

/**
 * Writes learning targets for every student whose targets are missing or out of
 * date, one after another. Students already up to date are skipped, so it can be
 * run again safely, and a student who fails is listed and left for next time.
 */
export function WriteAllTargetsButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setFailed([]);
    setNote(null);
    setProgress(null);
    try {
      const res = await fetch("/api/skill-targets");
      const { needing, withMistakes } = (await res.json()) as Needing;
      if (needing.length === 0) {
        setNote(
          withMistakes === 0
            ? "No student has prior-knowledge mistakes yet. Run “Sort the mistakes” on an assessment first."
            : `All ${withMistakes} students with prior-knowledge mistakes already have up-to-date targets.`
        );
        return;
      }
      setProgress({ done: 0, total: needing.length });
      const bad: string[] = [];
      let done = 0;
      for (const student of needing) {
        try {
          const r = await fetch(`/api/students/${student.id}/skill-targets`, { method: "POST" });
          if (!r.ok) bad.push(student.name);
        } catch {
          bad.push(student.name);
        }
        done += 1;
        setProgress({ done, total: needing.length });
      }
      setFailed(bad);
      setNote(
        bad.length === 0
          ? `Wrote targets for ${needing.length} student${needing.length === 1 ? "" : "s"}.`
          : `Wrote targets for ${needing.length - bad.length} of ${needing.length}.`
      );
      router.refresh();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not write the learning targets.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="max-w-sm text-right">
      <button
        onClick={run}
        disabled={running}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {running
          ? progress
            ? `Writing ${progress.done} of ${progress.total}...`
            : "Checking..."
          : "Write learning targets for all students"}
      </button>
      {note && <p className="mt-2 text-xs text-slate-600">{note}</p>}
      {failed.length > 0 && (
        <p className="mt-1 text-xs text-red-600">
          Failed for {failed.join(", ")}. Run it again to retry them.
        </p>
      )}
    </div>
  );
}
