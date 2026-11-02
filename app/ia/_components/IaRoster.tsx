"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IA_MILESTONES, type IaMilestone } from "@/lib/types";
import { MILESTONE_LABELS } from "./DeadlineEditor";
import { bulkSaveTopicsAction, bulkSetMilestoneAction } from "../actions";

export type RosterRow = {
  student: { id: number; name: string };
  doneMap: Record<string, string>;
  topic: string;
  /** The latest draft feedback's level per criterion; null when there is no feedback yet. */
  draftLevels: { criterion: string; level: number; max: number }[] | null;
  /** The feedback is older than the latest draft, or out of step with its math check. */
  levelsStale: boolean;
};

const CRITERION_NAMES: Record<string, string> = {
  A: "Presentation",
  B: "Mathematical communication",
  C: "Personal engagement",
  D: "Reflection",
  E: "Use of mathematics",
};

/** Same bands as the feedback cards: how close the level is to the criterion's maximum. */
function levelStyle(level: number, max: number): string {
  const ratio = max > 0 ? level / max : 0;
  if (ratio >= 0.75) return "bg-emerald-100 text-emerald-800";
  if (ratio >= 0.4) return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-800";
}

/** "2026-09-15 …" as "Sep 15th", so a milestone fits on one line. */
function shortDate(date?: string): string {
  if (!date) return "";
  const d = new Date(`${date.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date.slice(0, 10);
  const day = d.getDate();
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][day % 10] ?? "th";
  return `${d.toLocaleDateString("en-US", { month: "short" })} ${day}${suffix}`;
}

type Status = "done" | "late" | "pending";

function statusOf(done: string | undefined, due: string | undefined): Status {
  if (done) return "done";
  if (due && new Date(due) < new Date()) return "late";
  return "pending";
}

function Chip({ status, date }: { status: Status; date?: string }) {
  if (status === "done")
    return (
      <span
        className="whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
        title={date?.slice(0, 10)}
      >
        ✓ {shortDate(date)}
      </span>
    );
  if (status === "late")
    return (
      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">
        Late
      </span>
    );
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      Pending
    </span>
  );
}

export function IaRoster({
  rows,
  deadlineMap,
  classId,
}: {
  rows: RosterRow[];
  deadlineMap: Record<string, string>;
  /** The class shown, whose page is where students are added. */
  classId: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkMilestone, setBulkMilestone] = useState<IaMilestone>("topic_proposed");
  const [topics, setTopics] = useState<Record<number, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.student.id, r.topic ?? ""]))
  );
  const [pasteText, setPasteText] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const originalTopics = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.student.id, r.topic ?? ""])),
    [rows]
  );
  const allSelected = selected.size === rows.length && rows.length > 0;

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.student.id)));
  }

  function applyMilestone(complete: boolean) {
    if (selected.size === 0) {
      setMessage("Select at least one student first.");
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const res = await bulkSetMilestoneAction([...selected], bulkMilestone, complete);
      if (res.error) setMessage(res.error);
      else {
        setMessage(
          `${complete ? "Marked" : "Cleared"} “${MILESTONE_LABELS[bulkMilestone]}” for ${res.changed} student${res.changed === 1 ? "" : "s"}.`
        );
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  // Fill the topic inputs from a pasted block: one topic per line, in the row order shown.
  function applyPaste() {
    const lines = pasteText.replace(/\r/g, "").split("\n");
    setTopics((prev) => {
      const next = { ...prev };
      rows.forEach((r, i) => {
        if (i < lines.length && lines[i].trim() !== "") next[r.student.id] = lines[i].trim();
      });
      return next;
    });
    setMessage(`Filled ${Math.min(lines.filter((l) => l.trim()).length, rows.length)} topic(s) — review, then Save topics.`);
  }

  function saveTopics() {
    const entries = rows
      .map((r) => ({ studentId: r.student.id, topic: topics[r.student.id] ?? "" }))
      .filter((e) => e.topic !== (originalTopics[e.studentId] ?? ""));
    if (entries.length === 0) {
      setMessage("No topic changes to save.");
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const res = await bulkSaveTopicsAction(entries);
      if (res.error) setMessage(res.error);
      else {
        setMessage(`Saved ${res.changed} topic${res.changed === 1 ? "" : "s"}.`);
        router.refresh();
      }
    });
  }

  if (rows.length === 0) {
    return (
      <p className="mt-3 rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
        No students in this class yet —{" "}
        <Link href={`/classes/${classId}`} className="underline underline-offset-2">
          add them on the class page
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-4">
      {/* Bulk milestone toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
        <span className="font-medium text-slate-700">{selected.size} selected</span>
        <span className="text-slate-400">·</span>
        <label className="text-slate-600">Mark</label>
        <select
          value={bulkMilestone}
          onChange={(e) => setBulkMilestone(e.target.value as IaMilestone)}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        >
          {IA_MILESTONES.map((m) => (
            <option key={m} value={m}>
              {MILESTONE_LABELS[m]}
            </option>
          ))}
        </select>
        <button
          onClick={() => applyMilestone(true)}
          disabled={pending}
          className="rounded-md bg-emerald-600 px-3 py-1 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          as done
        </button>
        <button
          onClick={() => applyMilestone(false)}
          disabled={pending}
          className="rounded-md border border-slate-300 px-3 py-1 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          clear
        </button>
      </div>

      {/* Paste topics */}
      <details className="rounded-md border border-slate-200 bg-white p-3 text-sm">
        <summary className="cursor-pointer font-medium text-slate-700">
          Paste topics (one per line, in the order below)
        </summary>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={6}
          placeholder={"Modelling the spread of a virus\nOptimising a bakery's profit\n..."}
          className="mt-2 w-full rounded border border-slate-300 p-2 font-mono text-xs"
        />
        <button
          onClick={applyPaste}
          type="button"
          className="mt-2 rounded-md bg-slate-800 px-3 py-1 font-medium text-white hover:bg-slate-700"
        >
          Fill rows below
        </button>
      </details>

      {message && <p className="text-sm text-blue-700">{message}</p>}

      <p className="text-sm text-slate-600">
        A–E and Total are the levels on each student&rsquo;s draft feedback (green strong, amber
        developing, red early; faded with ↻ when the feedback is out of date).{" "}
        Click a student (or <span className="font-medium">Open</span>) to go to their exploration —
        that&rsquo;s where you upload the <span className="font-medium">draft</span> or{" "}
        <span className="font-medium">final</span> and generate feedback or marks.
      </p>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-3 py-2">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
              </th>
              <th className="px-4 py-2 font-medium">Student</th>
              {["A", "B", "C", "D", "E"].map((c) => (
                <th key={c} className="px-1 py-2 text-center font-medium" title={`Draft level — ${CRITERION_NAMES[c]}`}>
                  {c}
                </th>
              ))}
              <th className="px-2 py-2 text-center font-medium" title="Draft total out of 20">
                Total
              </th>
              {IA_MILESTONES.map((m) => (
                <th key={m} className="px-3 py-2 font-medium">
                  {MILESTONE_LABELS[m]}
                </th>
              ))}
              <th className="px-4 py-2 font-medium">Topic</th>
              <th className="px-4 py-2 font-medium">Feedback</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ student, doneMap, draftLevels, levelsStale }) => (
              <tr key={student.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(student.id)}
                    onChange={() => toggle(student.id)}
                    aria-label={`Select ${student.name}`}
                  />
                </td>
                <td className="whitespace-nowrap px-4 py-2 font-medium">
                  <Link
                    href={`/ia/${student.id}`}
                    className="text-blue-700 underline decoration-blue-300 underline-offset-2 hover:decoration-blue-600"
                  >
                    {student.name}
                  </Link>
                </td>
                {["A", "B", "C", "D", "E"].map((c) => {
                  const l = draftLevels?.find((x) => x.criterion === c);
                  return (
                    <td key={c} className="px-1 py-2 text-center">
                      {l ? (
                        <span
                          className={`inline-block min-w-9 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${levelStyle(l.level, l.max)} ${levelsStale ? "opacity-50" : ""}`}
                          title={`${CRITERION_NAMES[c]}: ${l.level} of ${l.max} on the draft${levelsStale ? " (out of date — regenerate the feedback)" : ""}`}
                        >
                          {l.level}/{l.max}
                        </span>
                      ) : (
                        <span className="text-slate-300">–</span>
                      )}
                    </td>
                  );
                })}
                <td className="whitespace-nowrap px-2 py-2 text-center font-semibold tabular-nums text-slate-700">
                  {draftLevels ? (
                    <span title={levelsStale ? "Out of date — regenerate the feedback" : "Draft total"} className={levelsStale ? "text-slate-400" : ""}>
                      {draftLevels.reduce((s, x) => s + x.level, 0)}/20{levelsStale ? " ↻" : ""}
                    </span>
                  ) : (
                    <span className="font-normal text-slate-300">–</span>
                  )}
                </td>
                {IA_MILESTONES.map((m) => (
                  <td key={m} className="px-3 py-2">
                    <Chip status={statusOf(doneMap[m], deadlineMap[m])} date={doneMap[m]} />
                  </td>
                ))}
                <td className="px-4 py-2">
                  <input
                    value={topics[student.id] ?? ""}
                    onChange={(e) =>
                      setTopics((prev) => ({ ...prev, [student.id]: e.target.value }))
                    }
                    placeholder="—"
                    className="w-56 rounded border border-slate-200 px-2 py-1 text-sm focus:border-slate-400"
                  />
                </td>
                <td className="whitespace-nowrap px-4 py-2">
                  <Link
                    href={`/ia/${student.id}`}
                    className="inline-block rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={saveTopics}
        disabled={pending}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save topics"}
      </button>
    </div>
  );
}
