"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import type { ExternalDataSource, StudentRow } from "@/lib/types";
import {
  previewExternalImportAction,
  confirmExternalImportAction,
  type ExternalImportPreviewData,
  type ImportFilePayload,
} from "../actions";

const SOURCE_OPTIONS: { value: ExternalDataSource; label: string }[] = [
  { value: "MAP", label: "MAP" },
  { value: "CAT4", label: "CAT4" },
  { value: "PRIOR_GRADES", label: "Prior year grades (A-D)" },
  { value: "ATL", label: "ATL" },
];

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function ImportExternalData({
  classId,
  students,
}: {
  classId: number;
  students: StudentRow[];
}) {
  const router = useRouter();
  const [source, setSource] = useState<ExternalDataSource>("MAP");
  const [raw, setRaw] = useState("");
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [filePayload, setFilePayload] = useState<ImportFilePayload | null>(null);
  const [preview, setPreview] = useState<ExternalImportPreviewData | null>(null);
  const [assignments, setAssignments] = useState<Record<number, number | "skip">>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRaw("");
    setFileLabel(file.name);
    if (/\.xlsx$/i.test(file.name)) {
      const buffer = await file.arrayBuffer();
      setFilePayload({ kind: "xlsx", base64: arrayBufferToBase64(buffer) });
    } else {
      setFilePayload({ kind: "text", text: await file.text() });
    }
    e.target.value = "";
  }

  function handleRawChange(value: string) {
    setRaw(value);
    setFileLabel(null);
    setFilePayload(null);
  }

  function currentPayload(): ImportFilePayload | null {
    if (filePayload) return filePayload;
    if (raw.trim()) return { kind: "text", text: raw };
    return null;
  }

  function handlePreview() {
    const payload = currentPayload();
    if (!payload) return;
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await previewExternalImportAction(classId, source, payload);
      if (res.error !== null) {
        setError(res.error);
        setPreview(null);
        return;
      }
      setPreview(res.preview);
      const initial: Record<number, number | "skip"> = {};
      for (const m of res.preview.matched) initial[m.rowIndex] = m.studentId;
      for (const u of res.preview.unmatched) initial[u.rowIndex] = "skip";
      setAssignments(initial);
    });
  }

  function setAssignment(rowIndex: number, value: number | "skip") {
    setAssignments((prev) => ({ ...prev, [rowIndex]: value }));
  }

  function handleConfirm() {
    if (!preview) return;
    startTransition(async () => {
      const res = await confirmExternalImportAction(
        classId,
        preview.source,
        preview.nameColumn,
        preview.rows,
        assignments
      );
      if (res.error) {
        setError(res.error);
        return;
      }
      const sourceLabel = SOURCE_OPTIONS.find((o) => o.value === preview.source)?.label ?? preview.source;
      setResult(`Imported ${res.imported} ${sourceLabel} record${res.imported === 1 ? "" : "s"}.`);
      setPreview(null);
      setRaw("");
      setFileLabel(null);
      setFilePayload(null);
      router.refresh();
    });
  }

  const hasInput = Boolean(currentPayload());

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-slate-700" htmlFor="import-source">
          Source
        </label>
        <select
          id="import-source"
          value={source}
          onChange={(e) => setSource(e.target.value as ExternalDataSource)}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          {SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <a
          href={`/api/templates/external/${source}`}
          className="text-sm text-slate-600 underline hover:text-slate-900"
        >
          Download template
        </a>
      </div>

      <textarea
        value={raw}
        onChange={(e) => handleRawChange(e.target.value)}
        rows={6}
        placeholder="Paste the export here (CSV or tab-separated, e.g. copied from a spreadsheet)"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
      />
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept=".csv,.tsv,.xlsx,text/csv,text/tab-separated-values"
          onChange={handleFile}
          className="text-sm"
        />
        {fileLabel && <span className="text-xs text-slate-500">{fileLabel}</span>}
      </div>

      <div>
        <button
          type="button"
          onClick={handlePreview}
          disabled={pending || !hasInput}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Preview import
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && <p className="text-sm text-emerald-700">{result}</p>}

      {preview && (
        <div className="space-y-4 rounded-md border border-slate-200 p-3">
          {preview.blankSkipped > 0 && (
            <p className="text-sm text-slate-500">
              {preview.blankSkipped} blank row{preview.blankSkipped === 1 ? "" : "s"} skipped.
            </p>
          )}
          <div>
            <p className="text-sm font-medium text-slate-700">
              Matched ({preview.matched.length})
            </p>
            <ul className="mt-1 space-y-1 text-sm text-slate-600">
              {preview.matched.map((m) => (
                <li key={m.rowIndex}>
                  Row {m.rowIndex + 1} → {m.studentName}
                </li>
              ))}
            </ul>
          </div>

          {preview.unmatched.length > 0 && (
            <div>
              <p className="text-sm font-medium text-amber-700">
                Unmatched ({preview.unmatched.length}) — map manually or skip
              </p>
              <ul className="mt-1 space-y-2 text-sm">
                {preview.unmatched.map((u) => (
                  <li key={u.rowIndex} className="flex items-center gap-2">
                    <span className="text-slate-600">
                      Row {u.rowIndex + 1}: &quot;{u.nameValue || "(blank)"}&quot;
                    </span>
                    <select
                      value={String(assignments[u.rowIndex] ?? "skip")}
                      onChange={(e) =>
                        setAssignment(
                          u.rowIndex,
                          e.target.value === "skip" ? "skip" : Number(e.target.value)
                        )
                      }
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                    >
                      <option value="skip">Skip</option>
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Confirm import
          </button>
        </div>
      )}
    </div>
  );
}
