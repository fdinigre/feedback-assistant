"use client";

import { useActionState, useRef, useState } from "react";
import {
  readTaskDocumentWithAi,
  removeTaskDocument,
  saveTaskDocumentText,
  setTaskDocumentKind,
  uploadTaskDocuments,
  type TaskDocumentReadState,
  type TaskDocumentTextState,
  type TaskDocumentUploadState,
} from "@/lib/assessment/actions";
import {
  MAX_DOC_CHARS_FOR_GRADING,
  TASK_DOCUMENT_KINDS,
  TASK_DOCUMENT_LABELS,
} from "@/lib/assessment/task-document-kinds";
import { fileSizeMb, MAX_UPLOAD_MB, tooLargeMessage } from "@/lib/assessment/upload-limits";
import type { TaskDocumentRow } from "@/lib/types";

const initialUpload: TaskDocumentUploadState = { error: null };
const initialText: TaskDocumentTextState = { error: null };
const initialRead: TaskDocumentReadState = { error: null };

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Everything a B/C/D task came with, in one list. Several files go up in one go;
 * each is filed under a kind guessed from its name, shown beside it to correct.
 */
export function TaskDocuments({
  assessmentId,
  documents,
}: {
  assessmentId: number;
  documents: TaskDocumentRow[];
}) {
  return (
    <div className="space-y-4">
      {documents.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
          {documents.map((d) => (
            <TaskDocumentItem key={d.id} assessmentId={assessmentId} document={d} />
          ))}
        </ul>
      )}
      <TaskDocumentUpload assessmentId={assessmentId} hasDocuments={documents.length > 0} />
    </div>
  );
}

function TaskDocumentUpload({
  assessmentId,
  hasDocuments,
}: {
  assessmentId: number;
  hasDocuments: boolean;
}) {
  const [state, formAction, pending] = useActionState(uploadTaskDocuments, initialUpload);
  const [tooLarge, setTooLarge] = useState<string | null>(null);
  const [chosen, setChosen] = useState(0);

  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-900">
        {hasDocuments ? "Add more documents" : "Upload the task documents"}
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        Choose several at once (PDF or Word): the task sheet, the template the students started
        from, the rubric or feedback checklist, an exemplar, a worked solution, any guidance. Each
        is read and labelled from its file name — change a label below if it guessed wrong.
      </p>
      <form action={formAction} className="mt-3 flex flex-wrap items-center gap-3">
        <input type="hidden" name="assessmentId" value={assessmentId} />
        <input
          type="file"
          name="files"
          multiple
          accept=".pdf,.docx"
          required
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            setChosen(files.length);
            const each = files.map(tooLargeMessage).find((m) => m !== null) ?? null;
            const totalMb = files.reduce((sum, f) => sum + fileSizeMb(f.size), 0);
            setTooLarge(
              each ??
                (totalMb > MAX_UPLOAD_MB
                  ? `Together these are ${totalMb.toFixed(0)} MB, over the ${MAX_UPLOAD_MB} MB limit for one upload — send them in two goes.`
                  : null)
            );
          }}
          className="text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
        />
        <button
          type="submit"
          disabled={pending || tooLarge !== null}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {pending ? "Reading…" : chosen > 1 ? `Upload ${chosen} files` : "Upload"}
        </button>
      </form>
      <p className="mt-2 text-xs text-slate-500">
        Typed PDFs and Word files are read here on your Mac. A scanned PDF is read by the AI from
        its page images, so if it is a student&apos;s work, blank out the name first. Any name from
        your rosters is taken out of the text before the grader ever sees it. A key worked by hand
        on a typed sheet keeps only its typed words this way — use &ldquo;Read the key with
        AI&rdquo; beside it to read the answers too.
      </p>
      {pending && (
        <p className="mt-2 text-xs text-slate-500">
          Reading the files — a scanned one can take up to a minute.
        </p>
      )}
      {tooLarge && <p className="mt-2 text-sm text-red-600">{tooLarge}</p>}
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state.added && state.added.length > 0 && (
        <div className="mt-2 text-sm text-emerald-700">
          <p>
            Added {plural(state.added.length, "document")}:{" "}
            {state.added
              .map((a) => `${a.name} as ${TASK_DOCUMENT_LABELS[a.kind].toLowerCase()}`)
              .join("; ")}
            .
          </p>
          {state.added
            .filter((a) => a.namesRemoved > 0)
            .map((a) => (
              <p key={a.name} className="text-amber-700">
                Took {plural(a.namesRemoved, "roster name")} out of {a.name}.
              </p>
            ))}
        </div>
      )}
      {state.failed && state.failed.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-sm text-red-600">
          {state.failed.map((f) => (
            <li key={f.name}>
              {f.name}: {f.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskDocumentItem({
  assessmentId,
  document: d,
}: {
  assessmentId: number;
  document: TaskDocumentRow;
}) {
  const kindForm = useRef<HTMLFormElement>(null);
  const [textState, saveText, saving] = useActionState(
    saveTaskDocumentText.bind(null, assessmentId, d.id),
    initialText
  );
  const [readState, readWithAi, reading] = useActionState(
    readTaskDocumentWithAi.bind(null, assessmentId, d.id),
    initialRead
  );
  const chars = d.text.length;
  const isPdf = /\.pdf$/i.test(d.original_name);
  const readLabel = d.kind === "solution" ? "Read the key with AI" : "Read the pages with AI";

  return (
    <li className="p-3">
      <div className="flex flex-wrap items-center gap-3">
        <form ref={kindForm} action={setTaskDocumentKind.bind(null, assessmentId, d.id)}>
          <select
            name="kind"
            defaultValue={d.kind}
            key={d.kind}
            aria-label={`What ${d.original_name} is`}
            onChange={() => kindForm.current?.requestSubmit()}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            {TASK_DOCUMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {TASK_DOCUMENT_LABELS[k]}
              </option>
            ))}
          </select>
        </form>
        <span className="min-w-[10rem] flex-1 truncate text-sm font-medium text-slate-900" title={d.original_name}>
          {d.original_name}
        </span>
        <span className="text-xs text-slate-500">
          {chars.toLocaleString()} characters{d.used_vision ? " · read by the AI from its pages" : ""}
        </span>
        {isPdf && (
          <form action={readWithAi}>
            <button
              type="submit"
              disabled={reading}
              onClick={(e) => {
                if (
                  !window.confirm(
                    `Read ${d.original_name} with the AI? Its reading replaces what the grader reads now, including any corrections you made to it.`
                  )
                ) {
                  e.preventDefault();
                }
              }}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              {reading ? "Reading…" : d.used_vision ? "Read again with AI" : readLabel}
            </button>
          </form>
        )}
        <form action={removeTaskDocument.bind(null, assessmentId, d.id)}>
          <button
            type="submit"
            onClick={(e) => {
              if (!window.confirm(`Remove ${d.original_name}? The grader stops reading it.`)) {
                e.preventDefault();
              }
            }}
            className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
          >
            Remove
          </button>
        </form>
      </div>
      {chars > MAX_DOC_CHARS_FOR_GRADING && (
        <p className="mt-1 text-xs text-amber-700">
          Only the first {MAX_DOC_CHARS_FOR_GRADING.toLocaleString()} characters reach the grader —
          trim it below to what matters for marking.
        </p>
      )}
      {reading && (
        <p className="mt-1 text-xs text-slate-500">
          The AI is reading the pages — about a minute for a few pages.
        </p>
      )}
      {readState.error && <p className="mt-1 text-xs text-red-600">{readState.error}</p>}
      {readState.chars !== undefined && !reading && (
        <p className="mt-1 text-xs text-emerald-700">
          Read {readState.chars.toLocaleString()} characters from the pages — check them below and
          correct anything it got wrong.
          {readState.namesRemoved
            ? ` Took ${plural(readState.namesRemoved, "roster name")} out.`
            : ""}
        </p>
      )}
      {/* Opened by a fresh AI reading: that is what the teacher has to check. */}
      <details className="mt-2" open={readState.chars !== undefined || undefined}>
        <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
          What the grader reads (edit to correct)
        </summary>
        <form action={saveText} className="mt-2 space-y-1">
          <textarea
            name="text"
            defaultValue={d.text}
            key={d.text}
            rows={12}
            className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save text"}
            </button>
            {textState.error && <span className="text-xs text-red-600">{textState.error}</span>}
            {textState.saved && (
              <span className="text-xs text-emerald-700">
                Saved ✓
                {textState.namesRemoved
                  ? ` — took ${plural(textState.namesRemoved, "roster name")} out`
                  : ""}
              </span>
            )}
          </div>
        </form>
      </details>
    </li>
  );
}
