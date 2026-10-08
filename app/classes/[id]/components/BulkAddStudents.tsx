"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { bulkAddDirectAction } from "../actions";

export function BulkAddStudents({ classId }: { classId: number }) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRaw(await file.text());
    e.target.value = "";
  }

  function handleAdd() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await bulkAddDirectAction(classId, raw);
      if (res.error) {
        setError(res.error);
        return;
      }
      const skipped =
        res.skipped > 0 ? ` (skipped ${res.skipped} already in the roster or repeated)` : "";
      setResult(`Added ${res.added} student${res.added === 1 ? "" : "s"}${skipped}.`);
      setRaw("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={6}
        placeholder="Paste a class list — one name per line, or a CSV with a Name column"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <input
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        onChange={handleFile}
        className="text-sm"
      />
      <div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={pending || !raw.trim()}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add students"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && <p className="text-sm text-emerald-700">{result}</p>}
    </div>
  );
}
