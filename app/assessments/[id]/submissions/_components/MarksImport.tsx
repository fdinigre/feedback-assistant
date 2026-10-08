"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  applySheetMarksAction,
  deleteMarksSheetAction,
  uploadMarksSheetAction,
  type MarksApplyResult,
} from "@/lib/marks-import/actions";
import type { MarksUploadSummary, SheetDifference, SheetDifferenceStatus } from "@/lib/types";

const STATUS_LABEL: Record<SheetDifferenceStatus, { text: string; className: string }> = {
  waiting: { text: "To check", className: "bg-amber-100 text-amber-800" },
  mine: { text: "Using your mark", className: "bg-emerald-100 text-emerald-800" },
  app: { text: "Kept the app's mark", className: "bg-slate-200 text-slate-700" },
  edited: { text: "Changed by hand since", className: "bg-slate-200 text-slate-700" },
};

/** SQLite's datetime('now') is UTC without a zone marker. */
function formatUploadedAt(value: string): string {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Stable identity for a difference, so ticking one row can't affect another. */
function keyOf(d: SheetDifference): string {
  return `${d.submissionId}:${d.questionId}`;
}

function Warning({
  title,
  items,
  fix,
}: {
  title: string;
  items: string[];
  /** Where it gets sorted out, when that is another page. */
  fix?: { href: string; label: string } | null;
}) {
  if (items.length === 0) return null;
  return (
    <li>
      <span className="font-medium">{title}:</span> {items.join(", ")}
      {fix && (
        <>
          {" "}
          <Link href={fix.href} className="font-medium underline underline-offset-2">
            {fix.label}
          </Link>
        </>
      )}
    </li>
  );
}

/**
 * Upload a marks spreadsheet and settle where it differs from the app's marks.
 *
 * The sheet and its comparison are stored, not held in this component, and
 * stay here until the teacher deletes them — settled rows included, so there
 * is a record of what was compared and what was chosen. Differences still
 * waiting are also flagged on the student's review page, beside the paper and
 * the AI's justification, which is where they can actually be checked.
 */
export function MarksImport({
  assessmentId,
  classId,
  sheet,
  differences,
  pointsOnly = false,
}: {
  assessmentId: number;
  /** The class whose roster the sheet's names are matched against. */
  classId: number | null;
  /** A points-only test: no criterion levels are recalculated from the marks. */
  pointsOnly?: boolean;
  /** The uploaded sheet on file; null when none (or it predates being recorded). */
  sheet: { fileName: string; uploadedAt: string; summary: MarksUploadSummary } | null;
  differences: SheetDifference[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const summary = sheet?.summary ?? null;
  // Waiting rows start ticked — the sheet is the teacher's own marking, so
  // accepting is the expected answer. A row whose app mark was deliberately
  // kept starts unticked, but can still be switched to the teacher's mark.
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<MarksApplyResult | null>(null);

  const open = differences.filter((d) => d.status !== "mine");
  const waiting = differences.filter((d) => d.status === "waiting");
  const isTicked = (d: SheetDifference) => (d.status === "waiting") !== toggled.has(keyOf(d));
  const ticked = open.filter(isTicked);

  async function onPick(file: File) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const buffer = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const result = await uploadMarksSheetAction(assessmentId, file.name, btoa(binary));
      if (result.error !== null) {
        setError(result.error);
        return;
      }
      setToggled(new Set());
      // The file now lives in the panel below; free the picker for a replacement.
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (ticked.length === 0) return;
    if (
      !window.confirm(
        `Use your mark for ${ticked.length} question${ticked.length === 1 ? "" : "s"}?\n\n` +
          "Your marks replace the current ones." +
          (pointsOnly ? "" : " Criterion A levels are recalculated from them.")
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const result = await applySheetMarksAction(
        assessmentId,
        ticked.map((d) => ({ submissionId: d.submissionId, questionId: d.questionId }))
      );
      setDone(result);
      setToggled(new Set());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteSheet() {
    if (
      !window.confirm(
        "Delete this marks sheet and its comparison?\n\n" +
          "Marks you already took from it stay as they are." +
          (waiting.length > 0
            ? ` The ${waiting.length} difference${waiting.length === 1 ? "" : "s"} still to check will stop being flagged.`
            : "")
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteMarksSheetAction(assessmentId);
      setDone(null);
      setToggled(new Set());
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function toggle(key: string) {
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-slate-700">
          {sheet ? "Replace with another sheet:" : "Upload your marks:"}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onPick(file);
          }}
          className="text-sm"
        />
        {busy && <span className="text-xs text-slate-500">Working…</span>}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        A spreadsheet with a Name column and Q1, Q2, … columns. Subtotal columns are ignored.
        An empty cell counts as zero. Uploading changes no marks — it only flags the differences.
      </p>

      {error && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {done && (
        <p className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {done.marksChanged} mark{done.marksChanged === 1 ? "" : "s"} updated.{" "}
          {done.levelsRecomputed > 0 &&
            `Criterion A recalculated for ${done.levelsRecomputed} student${done.levelsRecomputed === 1 ? "" : "s"}. `}
          {done.reportsAffected.length > 0 && (
            <>
              {done.reportsAffected.length === 1 ? "1 report was" : `${done.reportsAffected.length} reports were`}{" "}
              written from the old marks — regenerate{" "}
              {done.reportsAffected.length === 1 ? "it" : "them"} if you want the text to match:{" "}
              {done.reportsAffected.map((r, i) => (
                <span key={r.submissionId}>
                  {i > 0 && ", "}
                  <Link href={`/submissions/${r.submissionId}#report`} className="font-medium underline underline-offset-2">
                    {r.studentName}
                  </Link>
                </span>
              ))}
              .
            </>
          )}
        </p>
      )}

      {sheet && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <span className="text-sm font-medium text-slate-800">📄 {sheet.fileName}</span>
          <span className="text-xs text-slate-500">
            uploaded {formatUploadedAt(sheet.uploadedAt)} · {sheet.summary.unchanged} marks matched ·{" "}
            {differences.length} differed
            {differences.length > 0 ? ` (${waiting.length} still to check)` : ""}
          </span>
          <button
            type="button"
            onClick={deleteSheet}
            disabled={busy}
            className="ml-auto rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      )}

      {summary && (
        <div className="mt-3">
          {(summary.unmatchedNames.length > 0 ||
            summary.unmatchedLabels.length > 0 ||
            summary.missingFromSheet.length > 0 ||
            summary.withoutSubmission.length > 0) && (
            <ul className="mb-3 space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <Warning
                title="Names not on this class's roster"
                items={summary.unmatchedNames}
                fix={classId ? { href: `/classes/${classId}`, label: "Check the roster" } : null}
              />
              <Warning
                title="Columns with no matching question"
                items={summary.unmatchedLabels}
                fix={{ href: `/assessments/${assessmentId}/setup`, label: "Check the questions in Setup" }}
              />
              <Warning title="On the roster but not in the sheet" items={summary.missingFromSheet} />
              <Warning title="In the sheet but has no paper to mark" items={summary.withoutSubmission} />
            </ul>
          )}

          {(summary.ignoredColumns?.length ?? 0) > 0 && (
            <p className="mb-3 text-xs text-slate-500">
              Columns not read as questions: {summary.ignoredColumns!.join(", ")}. Question columns
              need headings like Q1, Q4a or Q4a).
            </p>
          )}

          {summary.overMax.length > 0 && (
            <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {summary.overMax.length} mark{summary.overMax.length === 1 ? " is" : "s are"} above
              the question maximum and {summary.overMax.length === 1 ? "was" : "were"} left out:{" "}
              {summary.overMax.slice(0, 6).join(", ")}
              {summary.overMax.length > 6 ? "…" : ""}. Fix the sheet and upload again.
            </p>
          )}

          {summary.unmarked > 0 && (
            <p className="mb-3 text-xs text-slate-500">
              {summary.unmarked} sheet mark{summary.unmarked === 1 ? " is" : "s are"} for questions
              the app hasn&apos;t marked yet, so there is nothing to compare.
            </p>
          )}

          {differences.length === 0 && (
            <p className="text-sm text-slate-700">
              No differences — all {summary.unchanged} marks already match.
            </p>
          )}
        </div>
      )}

      {differences.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm text-slate-700">
            {waiting.length > 0
              ? `${waiting.length} difference${waiting.length === 1 ? "" : "s"} still to check. Click a student to see it on their paper — the question is highlighted there, with the AI's justification — or accept them here.`
              : "Every difference has been settled. The comparison stays here until you delete the sheet."}
          </p>

          <div className="max-h-96 overflow-y-auto rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">Use mine</th>
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">Question</th>
                  <th className="px-3 py-2">App</th>
                  <th className="px-3 py-2">Your sheet</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {differences.map((d) => {
                  const key = keyOf(d);
                  // Compare against what the app had at upload, so a row still
                  // reads as a comparison after the teacher's mark is taken.
                  const appMark = d.appAtUpload ?? d.current;
                  const higher = appMark !== null && d.sheet > appMark;
                  const lower = appMark !== null && d.sheet < appMark;
                  const status = STATUS_LABEL[d.status];
                  return (
                    <tr
                      key={key}
                      className={`border-t border-slate-100 ${d.status === "waiting" ? "" : "bg-slate-50/60"}`}
                    >
                      <td className="px-3 py-1.5">
                        {d.status === "mine" ? (
                          <span className="text-emerald-700" aria-label="Already using your mark">
                            ✓
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={isTicked(d)}
                            onChange={() => toggle(key)}
                          />
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <Link
                          href={`/submissions/${d.submissionId}#q-${d.questionId}`}
                          className="underline decoration-slate-300 hover:decoration-slate-700"
                        >
                          {d.studentName}
                        </Link>
                      </td>
                      <td className="px-3 py-1.5 text-slate-600">
                        Q{d.questionNumber} <span className="text-slate-400">/{d.maxPoints}</span>
                      </td>
                      <td className="px-3 py-1.5 text-slate-500">
                        {appMark ?? <span title="The app has not marked this question">—</span>}
                        {d.status === "edited" && (
                          <span className="ml-1 text-xs text-slate-400">(now {d.current})</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 font-medium">
                        <span
                          className={`rounded px-1.5 py-0.5 ${
                            higher
                              ? "bg-indigo-100 text-indigo-800"
                              : lower
                                ? "bg-rose-100 text-rose-800"
                                : "bg-slate-100 text-slate-800"
                          }`}
                        >
                          {d.sheet} {higher ? "▲" : lower ? "▼" : ""}
                        </span>
                        {d.fromBlank && (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-800">
                            blank cell
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={`rounded px-1.5 py-0.5 text-xs ${status.className}`}>
                          {status.text}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {open.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={apply}
                disabled={busy || ticked.length === 0}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                Use my mark for {ticked.length} question{ticked.length === 1 ? "" : "s"}
              </button>
              <button
                type="button"
                onClick={() =>
                  setToggled(new Set(open.filter((d) => d.status !== "waiting").map(keyOf)))
                }
                className="text-xs text-slate-600 underline hover:text-slate-900"
              >
                Tick all
              </button>
              <button
                type="button"
                onClick={() => setToggled(new Set(waiting.map(keyOf)))}
                className="text-xs text-slate-600 underline hover:text-slate-900"
              >
                Untick all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
