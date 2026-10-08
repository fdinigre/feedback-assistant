"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  IA_CRITERIA,
  type IaCriterionMark,
  type IaDocumentRow,
  type IaDraftCriterionFeedback,
  type IaDraftFeedback,
  type IaFinalMarks,
  type IaOutputRow,
} from "@/lib/types";
import { injectNameDraftFeedback, injectNameFinalMarks } from "@/lib/ia/render";

const MAX_BY_CRITERION: Record<string, number> = Object.fromEntries(
  IA_CRITERIA.map((c) => [c.key, c.max])
);
const NAME_BY_CRITERION: Record<string, string> = Object.fromEntries(
  IA_CRITERIA.map((c) => [c.key, c.name])
);

/** ia_documents / ia_outputs are ordered newest-first — the first match of a kind is the latest. */
function latestByKind<T extends { kind: string }>(rows: T[], kind: string): T | null {
  return rows.find((r) => r.kind === kind) ?? null;
}

/** Band colour by how close the level is to the criterion maximum. */
function band(level: number, max: number): { border: string; badge: string; label: string } {
  const ratio = max > 0 ? level / max : 0;
  if (ratio >= 0.75)
    return { border: "border-l-emerald-500", badge: "bg-emerald-100 text-emerald-800", label: "strong" };
  if (ratio >= 0.4)
    return { border: "border-l-amber-500", badge: "bg-amber-100 text-amber-800", label: "developing" };
  return { border: "border-l-rose-500", badge: "bg-rose-100 text-rose-800", label: "early" };
}

function wordCount(text: string | null | undefined): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable — no-op */
        }
      }}
      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-100"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

function LengthNote({ label, count }: { label: string; count: number }) {
  if (count === 0) return null;
  let note = "";
  if (count < 1200) note = " — on the short side; IB recommends roughly 12–20 pages.";
  else if (count > 3600) note = " — quite long; IB recommends roughly 12–20 pages, so check for padding.";
  return (
    <p className="text-xs text-slate-500">
      {label}: ~{count.toLocaleString()} words{note}
    </p>
  );
}

export function UploadAndOutputsClient({
  explorationId,
  studentName,
  pseudonym,
  documents,
  outputs,
}: {
  explorationId: number;
  studentName: string;
  pseudonym: string;
  documents: IaDocumentRow[];
  outputs: IaOutputRow[];
}) {
  const router = useRouter();
  const draftDoc = latestByKind(documents, "draft");
  const finalDoc = latestByKind(documents, "final");
  const draftFeedbackRow = latestByKind(outputs, "draft_feedback");
  const finalMarksRow = latestByKind(outputs, "final_marks");

  const [uploadingKind, setUploadingKind] = useState<"draft" | "final" | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<IaDraftFeedback | null>(
    draftFeedbackRow
      ? injectNameDraftFeedback(draftFeedbackRow.content as IaDraftFeedback, studentName, pseudonym)
      : null
  );
  const [feedbackOutputId, setFeedbackOutputId] = useState<number | null>(draftFeedbackRow?.id ?? null);
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(draftFeedbackRow?.status ?? null);
  const [generatingFeedback, setGeneratingFeedback] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [approvingFeedback, setApprovingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const [marks, setMarks] = useState<IaFinalMarks | null>(
    finalMarksRow
      ? injectNameFinalMarks(finalMarksRow.content as IaFinalMarks, studentName, pseudonym)
      : null
  );
  const [marksOutputId, setMarksOutputId] = useState<number | null>(finalMarksRow?.id ?? null);
  const [marksStatus, setMarksStatus] = useState<string | null>(finalMarksRow?.status ?? null);
  const [generatingMarks, setGeneratingMarks] = useState(false);
  const [savingMarks, setSavingMarks] = useState(false);
  const [approvingMarks, setApprovingMarks] = useState(false);
  const [marksError, setMarksError] = useState<string | null>(null);

  async function uploadFile(kind: "draft" | "final", file: File) {
    setUploadingKind(kind);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.set("explorationId", String(explorationId));
      fd.set("kind", kind);
      fd.set("file", file);
      const res = await fetch("/api/ia/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setUploadError((json && json.error) ?? `Upload failed (${res.status}).`);
        return;
      }
      router.refresh();
    } catch {
      setUploadError("Network error — could not reach the server.");
    } finally {
      setUploadingKind(null);
    }
  }

  async function generateFeedback() {
    setGeneratingFeedback(true);
    setFeedbackError(null);
    try {
      const res = await fetch("/api/ia/draft-feedback/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ explorationId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFeedbackError((json && json.error) ?? `Failed to generate feedback (${res.status}).`);
        return;
      }
      const output = json.output as IaOutputRow;
      setFeedback(injectNameDraftFeedback(output.content as IaDraftFeedback, studentName, pseudonym));
      setFeedbackOutputId(output.id);
      setFeedbackStatus(output.status);
    } catch {
      setFeedbackError("Network error — could not reach the server.");
    } finally {
      setGeneratingFeedback(false);
    }
  }

  async function saveFeedback() {
    if (!feedback || feedbackOutputId == null) return;
    setSavingFeedback(true);
    try {
      const res = await fetch("/api/ia/draft-feedback/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputId: feedbackOutputId, content: feedback }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) setFeedback(json.output.content as IaDraftFeedback);
    } finally {
      setSavingFeedback(false);
    }
  }

  async function approveFeedback() {
    if (feedbackOutputId == null) return;
    setApprovingFeedback(true);
    try {
      const res = await fetch("/api/ia/draft-feedback/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputId: feedbackOutputId, explorationId }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        setFeedbackStatus(json.output.status);
        router.refresh();
      }
    } finally {
      setApprovingFeedback(false);
    }
  }

  async function generateMarks() {
    setGeneratingMarks(true);
    setMarksError(null);
    try {
      const res = await fetch("/api/ia/final-marks/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ explorationId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMarksError((json && json.error) ?? `Failed to generate marks (${res.status}).`);
        return;
      }
      const output = json.output as IaOutputRow;
      setMarks(injectNameFinalMarks(output.content as IaFinalMarks, studentName, pseudonym));
      setMarksOutputId(output.id);
      setMarksStatus(output.status);
    } catch {
      setMarksError("Network error — could not reach the server.");
    } finally {
      setGeneratingMarks(false);
    }
  }

  async function saveMarks() {
    if (!marks || marksOutputId == null) return;
    setSavingMarks(true);
    try {
      const res = await fetch("/api/ia/final-marks/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputId: marksOutputId, content: marks }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) setMarks(json.output.content as IaFinalMarks);
    } finally {
      setSavingMarks(false);
    }
  }

  async function approveMarks() {
    if (marksOutputId == null) return;
    setApprovingMarks(true);
    try {
      const res = await fetch("/api/ia/final-marks/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputId: marksOutputId, explorationId }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        setMarksStatus(json.output.status);
        router.refresh();
      }
    } finally {
      setApprovingMarks(false);
    }
  }

  const liveTotal = marks ? marks.criteria.reduce((sum, c) => sum + (c.final ?? c.proposed), 0) : 0;
  const pct = Math.round((liveTotal / 20) * 100);

  return (
    <div className="space-y-8">
      {/* Draft */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Draft</h2>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          {draftDoc ? (
            <span className="text-slate-600">
              Uploaded: {draftDoc.original_name} ({draftDoc.uploaded_at.slice(0, 10)})
            </span>
          ) : (
            <span className="text-slate-400">No draft uploaded yet.</span>
          )}
          <FileUploadButton
            label={draftDoc ? "Re-upload draft" : "Upload draft"}
            uploading={uploadingKind === "draft"}
            onFile={(f) => uploadFile("draft", f)}
          />
        </div>
        {draftDoc && <div className="mt-1"><LengthNote label="Draft length" count={wordCount(draftDoc.text)} /></div>}
        {uploadError && <p className="mt-2 text-sm text-rose-700">{uploadError}</p>}

        {draftDoc && (
          <div className="mt-4">
            <button
              type="button"
              onClick={generateFeedback}
              disabled={generatingFeedback}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {generatingFeedback ? "Generating…" : feedback ? "Regenerate feedback" : "Generate draft feedback"}
            </button>
            {feedbackError && <p className="mt-2 text-sm text-rose-700">{feedbackError}</p>}

            {feedback && (
              <div className="mt-4 space-y-4">
                <p className="text-xs text-slate-500">
                  Colour shows how close each criterion is to its maximum on the current draft.
                  Levels and comments are editable — adjust, then Save.
                </p>
                {feedback.criteria.map((c, idx) => (
                  <CriterionFeedback
                    key={c.criterion}
                    mark={c}
                    max={MAX_BY_CRITERION[c.criterion] ?? 0}
                    onChange={(next) =>
                      setFeedback((prev) => {
                        if (!prev) return prev;
                        const criteria = prev.criteria.map((x, i) => (i === idx ? next : x));
                        return { ...prev, criteria };
                      })
                    }
                  />
                ))}
                <div>
                  <label className="block text-sm font-medium text-slate-700">Summary (for you)</label>
                  <textarea
                    value={feedback.summary}
                    onChange={(e) =>
                      setFeedback((prev) => (prev ? { ...prev, summary: e.target.value } : prev))
                    }
                    rows={3}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <ToddleComment
                  value={feedback.toddleComment ?? ""}
                  onChange={(v) => setFeedback((prev) => (prev ? { ...prev, toddleComment: v } : prev))}
                />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={saveFeedback}
                    disabled={savingFeedback}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
                  >
                    {savingFeedback ? "Saving…" : "Save changes"}
                  </button>
                  <button
                    type="button"
                    onClick={approveFeedback}
                    disabled={approvingFeedback || feedbackStatus === "approved"}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {feedbackStatus === "approved"
                      ? "Approved ✓"
                      : approvingFeedback
                        ? "Approving…"
                        : "Approve feedback"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Final */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Final submission</h2>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          {finalDoc ? (
            <span className="text-slate-600">
              Uploaded: {finalDoc.original_name} ({finalDoc.uploaded_at.slice(0, 10)})
            </span>
          ) : (
            <span className="text-slate-400">No final submission uploaded yet.</span>
          )}
          <FileUploadButton
            label={finalDoc ? "Re-upload final" : "Upload final"}
            uploading={uploadingKind === "final"}
            onFile={(f) => uploadFile("final", f)}
          />
        </div>
        {finalDoc && <div className="mt-1"><LengthNote label="Final length" count={wordCount(finalDoc.text)} /></div>}

        {finalDoc && (
          <div className="mt-4">
            <button
              type="button"
              onClick={generateMarks}
              disabled={generatingMarks}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {generatingMarks ? "Generating…" : marks ? "Regenerate marks" : "Generate final marks"}
            </button>
            {marksError && <p className="mt-2 text-sm text-rose-700">{marksError}</p>}

            {marks && (
              <div className="mt-4 space-y-4">
                {marks.criteria.map((c, idx) => (
                  <CriterionMarkPanel
                    key={c.criterion}
                    mark={c}
                    max={MAX_BY_CRITERION[c.criterion] ?? 0}
                    onChange={(next) =>
                      setMarks((prev) => {
                        if (!prev) return prev;
                        const criteria = prev.criteria.map((x, i) => (i === idx ? next : x));
                        return { ...prev, criteria };
                      })
                    }
                  />
                ))}
                <div className="rounded-md bg-slate-50 p-3 text-sm font-semibold">
                  IA mark: {liveTotal} / 20 <span className="font-normal text-slate-500">({pct}%)</span>
                </div>
                {marks.authenticity && <AuthenticityPanel authenticity={marks.authenticity} />}
                <ToddleComment
                  value={marks.toddleComment ?? ""}
                  onChange={(v) => setMarks((prev) => (prev ? { ...prev, toddleComment: v } : prev))}
                />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={saveMarks}
                    disabled={savingMarks}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
                  >
                    {savingMarks ? "Saving…" : "Save changes"}
                  </button>
                  <button
                    type="button"
                    onClick={approveMarks}
                    disabled={approvingMarks || marksStatus === "approved"}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {marksStatus === "approved" ? "Approved ✓" : approvingMarks ? "Approving…" : "Approve marks"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Draft → final progress */}
      {feedback && marks && <DraftFinalDelta feedback={feedback} marks={marks} />}
    </div>
  );
}

function FileUploadButton({
  label,
  uploading,
  onFile,
}: {
  label: string;
  uploading: boolean;
  onFile: (f: File) => void;
}) {
  return (
    <label className="cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100">
      {uploading ? "Uploading…" : label}
      <input
        type="file"
        accept=".docx,.pdf"
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </label>
  );
}

function ToddleComment({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="rounded-md border border-indigo-200 bg-indigo-50/60 p-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">Toddle comment (for the student)</label>
        <CopyButton text={value} />
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder="A short, student-facing comment ready to paste into Toddle."
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}

function AuthenticityPanel({ authenticity }: { authenticity: { level: "ok" | "look"; notes: string[] } }) {
  const look = authenticity.level === "look";
  return (
    <div
      className={`rounded-md border p-3 text-sm ${
        look ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"
      }`}
    >
      <p className="font-medium text-slate-700">
        Authenticity {look ? "— worth a look" : "— nothing flagged"}
      </p>
      {look ? (
        <>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">
            {authenticity.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            This is not a plagiarism or AI verdict — just internal inconsistencies to confirm with the
            student before you sign the authenticity statement.
          </p>
        </>
      ) : (
        <p className="mt-1 text-slate-600">No internal voice or consistency issues stood out.</p>
      )}
    </div>
  );
}

function CriterionFeedback({
  mark,
  max,
  onChange,
}: {
  mark: IaDraftCriterionFeedback;
  max: number;
  onChange: (next: IaDraftCriterionFeedback) => void;
}) {
  const level = mark.level ?? 0;
  const b = band(level, max);
  const evidence = mark.evidence ?? [];
  return (
    <div className={`rounded-md border border-l-4 border-slate-200 ${b.border} p-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Criterion {mark.criterion} · {NAME_BY_CRITERION[mark.criterion]}
        </h3>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.badge}`}>{b.label}</span>
          <label className="text-xs font-medium text-slate-600">Level</label>
          <select
            value={level}
            onChange={(e) => onChange({ ...mark, level: Number(e.target.value) })}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            {Array.from({ length: max + 1 }, (_, i) => i).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-400">/ {max}</span>
        </div>
      </div>

      {evidence.length > 0 && (
        <div className="mt-2 rounded bg-slate-50 p-2 text-sm">
          <p className="text-xs font-medium text-slate-500">Evidence in the draft</p>
          <ul className="mt-1 space-y-1">
            {evidence.map((e, i) => (
              <li key={i} className="text-slate-700">
                <span className="font-medium">&ldquo;{e.quote}&rdquo;</span>{" "}
                <span className="text-xs text-slate-400">— {e.location}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ListField label="Strengths" items={mark.strengths} onChange={(items) => onChange({ ...mark, strengths: items })} />
      <ListField label="To reach the next band" items={mark.gaps} onChange={(items) => onChange({ ...mark, gaps: items })} />
      <ListField
        label="Suggested fixes"
        items={mark.suggestions}
        onChange={(items) => onChange({ ...mark, suggestions: items })}
      />
    </div>
  );
}

function ListField({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div className="mt-2">
      <label className="block text-xs font-medium text-slate-500">{label} (one per line)</label>
      <textarea
        value={items.join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n"))}
        rows={Math.max(2, items.length)}
        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
    </div>
  );
}

function CriterionMarkPanel({
  mark,
  max,
  onChange,
}: {
  mark: IaCriterionMark;
  max: number;
  onChange: (next: IaCriterionMark) => void;
}) {
  const finalValue = mark.final ?? mark.proposed;
  const b = band(finalValue, max);
  return (
    <div className={`rounded-md border border-l-4 border-slate-200 ${b.border} p-3`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Criterion {mark.criterion} · {NAME_BY_CRITERION[mark.criterion]}
        </h3>
        <span className="text-xs text-slate-500">
          Proposed: {mark.proposed} / {max}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <label className="text-xs font-medium text-slate-600">Final</label>
        <select
          value={finalValue}
          onChange={(e) => onChange({ ...mark, final: Number(e.target.value) })}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          {Array.from({ length: max + 1 }, (_, i) => i).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2 space-y-1 text-sm">
        {mark.evidence.map((e, i) => (
          <p key={i} className="text-slate-700">
            <span className="font-medium">&ldquo;{e.quote}&rdquo;</span> — {e.location}
          </p>
        ))}
      </div>
      <p className="mt-2 text-sm text-slate-700">
        <span className="font-medium">Justification: </span>
        {mark.justification}
      </p>
    </div>
  );
}

/** Deterministic comparison of the draft's evidenced level vs the final mark, per criterion. */
function DraftFinalDelta({ feedback, marks }: { feedback: IaDraftFeedback; marks: IaFinalMarks }) {
  const finalByCriterion: Record<string, number> = Object.fromEntries(
    marks.criteria.map((c) => [c.criterion, c.final ?? c.proposed])
  );
  const rows = feedback.criteria
    .filter((c) => c.criterion in finalByCriterion)
    .map((c) => {
      const from = c.level ?? 0;
      const to = finalByCriterion[c.criterion];
      return { criterion: c.criterion, from, to, delta: to - from };
    });
  if (rows.length === 0) return null;
  const totalDelta = rows.reduce((s, r) => s + r.delta, 0);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-semibold">Draft → final progress</h2>
      <p className="mt-1 text-sm text-slate-600">
        How each criterion moved from the level evidenced in the draft to the final mark — a quick read
        on whether the feedback was acted on.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-1 pr-4">Criterion</th>
              <th className="py-1 pr-4">Draft</th>
              <th className="py-1 pr-4">Final</th>
              <th className="py-1">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.criterion} className="border-t border-slate-100">
                <td className="py-1.5 pr-4 text-slate-700">
                  {r.criterion} · {NAME_BY_CRITERION[r.criterion]}
                </td>
                <td className="py-1.5 pr-4 text-slate-600">{r.from}</td>
                <td className="py-1.5 pr-4 text-slate-600">{r.to}</td>
                <td className="py-1.5">
                  <DeltaChip delta={r.delta} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Overall: <DeltaChip delta={totalDelta} /> across the exploration.
      </p>
    </section>
  );
}

function DeltaChip({ delta }: { delta: number }) {
  if (delta > 0)
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">▲ +{delta}</span>;
  if (delta < 0)
    return <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">▼ {delta}</span>;
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">no change</span>;
}
