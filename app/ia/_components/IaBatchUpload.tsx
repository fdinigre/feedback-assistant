"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { duplicateAssignments, matchFileToStudent } from "@/lib/ia/batch-match";
import { ensureIaExplorationsAction } from "../actions";

export type BatchStudent = { id: number; name: string; hasDraft: boolean; hasFinal: boolean };

type Item = {
  key: number;
  file: File;
  studentId: number | null;
  match: "matched" | "ambiguous" | "none" | "manual";
  status: "ready" | "uploading" | "done" | "error";
  error?: string;
};

let nextKey = 1;

export function IaBatchUpload({ students }: { students: BatchStudent[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"draft" | "final">("draft");
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const byId = new Map(students.map((s) => [s.id, s]));
  const dup = duplicateAssignments(
    items.filter((i) => i.status !== "done").map((i) => i.studentId)
  );

  function addFiles(list: FileList | File[]) {
    const files = [...list];
    const ok = files.filter((f) => /\.(pdf|docx)$/i.test(f.name));
    const skipped = files.length - ok.length;
    const added: Item[] = ok.map((file) => {
      const m = matchFileToStudent(file.name, students);
      return {
        key: nextKey++,
        file,
        studentId: m.kind === "matched" ? m.studentId : null,
        match: m.kind,
        status: "ready",
      };
    });
    setItems((prev) => [...prev, ...added]);
    setMessage(
      skipped > 0 ? `${skipped} file${skipped === 1 ? " was" : "s were"} left out — only .pdf and .docx are accepted.` : null
    );
  }

  function patch(key: number, change: Partial<Item>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...change } : i)));
  }

  const pendingItems = items.filter((i) => i.status !== "done");
  const toUpload = pendingItems.filter((i) => i.studentId != null);
  const unassigned = pendingItems.length - toUpload.length;
  const blocked = dup.size > 0;

  async function uploadAll() {
    if (blocked || toUpload.length === 0) return;
    setBusy(true);
    setMessage(null);
    const ids = [...new Set(toUpload.map((i) => i.studentId as number))];
    const res = await ensureIaExplorationsAction(ids);
    if (res.error) {
      setMessage(res.error);
      setBusy(false);
      return;
    }
    let done = 0;
    let failed = 0;
    for (const item of toUpload) {
      patch(item.key, { status: "uploading", error: undefined });
      try {
        const fd = new FormData();
        fd.set("explorationId", String(res.explorationIds[item.studentId as number]));
        fd.set("kind", kind);
        fd.set("file", item.file);
        const r = await fetch("/api/ia/upload", { method: "POST", body: fd });
        const json = await r.json().catch(() => null);
        if (!r.ok) {
          failed++;
          patch(item.key, { status: "error", error: (json && json.error) ?? `Upload failed (${r.status}).` });
        } else {
          done++;
          patch(item.key, { status: "done" });
        }
      } catch {
        failed++;
        patch(item.key, { status: "error", error: "Network error — could not reach the server." });
      }
    }
    setBusy(false);
    setMessage(
      `${done} uploaded${failed ? `, ${failed} failed — fix or remove ${failed === 1 ? "it" : "them"} and upload again` : ""}.`
    );
    router.refresh();
  }

  return (
    <section>
      <h2 className="text-lg font-medium">Upload IA files for the class</h2>
      <p className="mt-1 text-sm text-slate-600">
        Drop many files at once. Each is matched to a student by the name in its file name; check the
        matches, fix any, then upload. Files are read on this computer and the student&rsquo;s name is
        replaced by their code before anything reaches the AI.
      </p>
      <div className="mt-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            These are
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "draft" | "final")}
              disabled={busy}
              className="rounded border border-slate-300 bg-white px-2 py-1"
            >
              <option value="draft">drafts</option>
              <option value="final">final submissions</option>
            </select>
          </label>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!busy) addFiles(e.dataTransfer.files);
          }}
          className={
            "rounded-md border-2 border-dashed p-6 text-center text-sm " +
            (dragOver ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white")
          }
        >
          <p className="text-slate-600">Drag PDF or Word files here, or</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="mt-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            Choose files
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.docx"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {items.length > 0 && (
          <>
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-1 pr-3">File</th>
                  <th className="py-1 pr-3">Student</th>
                  <th className="py-1 pr-3">Status</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const student = i.studentId != null ? byId.get(i.studentId) : undefined;
                  const replaces =
                    student && i.status !== "done" && (kind === "draft" ? student.hasDraft : student.hasFinal);
                  const isDup = i.studentId != null && i.status !== "done" && dup.has(i.studentId);
                  return (
                    <tr key={i.key} className="border-t border-slate-200 align-top">
                      <td className="py-2 pr-3">
                        <div className="break-all">{i.file.name}</div>
                        {/\.docx$/i.test(i.file.name) && (
                          <div className="text-xs text-slate-500">
                            Word file — written feedback works, but it can&rsquo;t be highlighted; export it as a PDF for that.
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <select
                          aria-label={`Student for ${i.file.name}`}
                          value={i.studentId ?? ""}
                          disabled={busy || i.status === "done"}
                          onChange={(e) =>
                            patch(i.key, {
                              studentId: e.target.value ? Number(e.target.value) : null,
                              match: "manual",
                            })
                          }
                          className={
                            "w-full max-w-xs rounded border bg-white px-2 py-1 " +
                            (isDup ? "border-rose-400" : "border-slate-300")
                          }
                        >
                          <option value="">— choose a student —</option>
                          {students.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        <div className="mt-1 text-xs">
                          {i.match === "ambiguous" && !i.studentId && (
                            <span className="text-amber-700">Matches more than one student — choose.</span>
                          )}
                          {i.match === "none" && !i.studentId && (
                            <span className="text-amber-700">No name found in the file name — choose.</span>
                          )}
                          {i.match === "matched" && <span className="text-slate-500">Matched from the file name</span>}
                          {isDup && <span className="text-rose-700"> Two files for this student — remove one.</span>}
                          {replaces && !isDup && (
                            <span className="text-slate-500">
                              {" "}
                              Already has a {kind}; this becomes the latest.
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        {i.status === "ready" && <span className="text-slate-500">Ready</span>}
                        {i.status === "uploading" && <span className="text-blue-700">Uploading…</span>}
                        {i.status === "done" && <span className="text-emerald-700">✓ Uploaded</span>}
                        {i.status === "error" && <span className="text-rose-700">{i.error}</span>}
                      </td>
                      <td className="py-2 text-right">
                        {i.status !== "done" && i.status !== "uploading" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setItems((prev) => prev.filter((x) => x.key !== i.key))}
                            className="text-xs text-slate-500 underline"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={uploadAll}
                disabled={busy || blocked || toUpload.length === 0}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {busy ? "Uploading…" : `Upload ${toUpload.length} file${toUpload.length === 1 ? "" : "s"}`}
              </button>
              {unassigned > 0 && (
                <span className="text-sm text-amber-700">
                  {unassigned} file{unassigned === 1 ? " has" : "s have"} no student and will be skipped.
                </span>
              )}
              {items.some((i) => i.status === "done") && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setItems((prev) => prev.filter((i) => i.status !== "done"))}
                  className="text-sm text-slate-500 underline"
                >
                  Clear uploaded
                </button>
              )}
            </div>
          </>
        )}
        {message && <p className="text-sm text-blue-700">{message}</p>}
      </div>
    </section>
  );
}
