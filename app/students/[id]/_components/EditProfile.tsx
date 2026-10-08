"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ClassRow, ExternalDataSource } from "@/lib/types";
import {
  deleteExternalDataAction,
  saveExternalDataAction,
  updateStudentProfileAction,
} from "../actions";

const SOURCE_LABEL: Record<ExternalDataSource, string> = {
  MAP: "MAP",
  CAT4: "CAT4",
  PRIOR_GRADES: "Prior year grades",
  ATL: "ATL",
};
const SOURCES: ExternalDataSource[] = ["MAP", "CAT4", "PRIOR_GRADES", "ATL"];

type Field = { key: string; value: string };

/** Imported data is stored as loose JSON; only flat text fields can be edited here. */
function toFields(data: unknown): Field[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  return Object.entries(data as Record<string, unknown>).map(([key, value]) => ({
    key,
    value: value === null || value === undefined ? "" : String(value),
  }));
}

/**
 * Edit a student's profile in place: name, class, and each imported data set
 * (MAP, CAT4, prior grades, ATL) field by field. Collapsed by default — the
 * profile page is for reading a student, and this is the exception.
 */
export function EditProfile({
  student,
  classes,
  external,
}: {
  student: { id: number; name: string; class_id: number; pseudonym: string; modified: boolean };
  classes: ClassRow[];
  external: { source: ExternalDataSource; period: string | null; data: unknown }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(student.name);
  const [classId, setClassId] = useState(student.class_id);
  const [modified, setModified] = useState(student.modified);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const [fieldsBySource, setFieldsBySource] = useState<Record<ExternalDataSource, Field[]>>(
    () =>
      Object.fromEntries(
        SOURCES.map((s) => [s, toFields(external.find((e) => e.source === s)?.data)])
      ) as Record<ExternalDataSource, Field[]>
  );
  const hasData = (source: ExternalDataSource) =>
    external.some((e) => e.source === source);

  // Prior grades keep one record per semester. The editor works on the most
  // recent — the list arrives newest first — and names the rest rather than
  // pretending they are not there.
  const recordOf = (source: ExternalDataSource) => external.find((e) => e.source === source);
  const otherPeriods = (source: ExternalDataSource) =>
    external
      .filter((e) => e.source === source)
      .slice(1)
      .map((e) => e.period)
      .filter((p): p is string => Boolean(p));

  const currentClass = classes.find((c) => c.id === student.class_id);
  const movingClass = classId !== student.class_id;

  function report(result: { error: string | null }, okText: string) {
    if (result.error) setMessage({ kind: "error", text: result.error });
    else {
      setMessage({ kind: "ok", text: okText });
      router.refresh();
    }
  }

  function saveProfile() {
    setMessage(null);
    startTransition(async () => {
      report(
        await updateStudentProfileAction(student.id, { name, classId, modified }),
        "Profile saved."
      );
    });
  }

  function setField(source: ExternalDataSource, index: number, patch: Partial<Field>) {
    setFieldsBySource((prev) => ({
      ...prev,
      [source]: prev[source].map((f, i) => (i === index ? { ...f, ...patch } : f)),
    }));
  }

  function removeField(source: ExternalDataSource, index: number) {
    setFieldsBySource((prev) => ({
      ...prev,
      [source]: prev[source].filter((_, i) => i !== index),
    }));
  }

  function addField(source: ExternalDataSource) {
    setFieldsBySource((prev) => ({ ...prev, [source]: [...prev[source], { key: "", value: "" }] }));
  }

  function saveSource(source: ExternalDataSource) {
    setMessage(null);
    startTransition(async () => {
      report(
        await saveExternalDataAction(
          student.id,
          source,
          fieldsBySource[source],
          recordOf(source)?.period ?? null
        ),
        `${SOURCE_LABEL[source]} data saved.`
      );
    });
  }

  function deleteSource(source: ExternalDataSource) {
    const period = recordOf(source)?.period ?? null;
    const what = period
      ? `the ${period} ${SOURCE_LABEL[source]} record`
      : `all ${SOURCE_LABEL[source]} data`;
    if (!window.confirm(`Delete ${what} for ${student.name}?`)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await deleteExternalDataAction(student.id, source, period);
      if (!result.error) setFieldsBySource((prev) => ({ ...prev, [source]: [] }));
      report(result, `${SOURCE_LABEL[source]} data deleted.`);
    });
  }

  const inputClass = "rounded border border-slate-300 px-2 py-1 text-sm";

  return (
    <details className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-slate-900">Edit profile</summary>

      {message && (
        <p
          className={`mt-3 rounded-md border px-3 py-2 text-sm ${
            message.kind === "ok"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </p>
      )}

      {/* Name and class */}
      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full ${inputClass}`}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Class</span>
            <select
              value={classId}
              onChange={(e) => setClassId(Number(e.target.value))}
              className={`w-full ${inputClass} bg-white`}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (Grade {c.grade})
                </option>
              ))}
            </select>
          </label>
        </div>
        {movingClass && (
          <p className="mt-2 text-xs text-amber-800">
            Moving {student.name} out of {currentClass?.name ?? "this class"} keeps their marked
            papers, but those assessments belong to the old class, so they will no longer show
            under the student&apos;s new class.
          </p>
        )}
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={modified}
            onChange={(e) => setModified(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium text-slate-800">Modified tier</span>
            <span className="block text-xs text-slate-500">
              Sits the modified version of any test that has one (questions marked &ldquo;modified
              only&rdquo; count; &ldquo;standard only&rdquo; ones are skipped). Off for everyone
              unless you switch it on.
            </span>
          </span>
        </label>
        <p className="mt-2 text-xs text-slate-500">
          Pseudonym <span className="font-mono">{student.pseudonym}</span> — this is what the AI
          sees instead of the name, and can&apos;t be changed.
        </p>
        <div className="mt-3">
          <button
            type="button"
            onClick={saveProfile}
            disabled={
              pending ||
              (name.trim() === student.name && !movingClass && modified === student.modified)
            }
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Save name and class
          </button>
        </div>
      </div>

      {/* Imported data, one block per source */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {SOURCES.map((source) => {
          const fields = fieldsBySource[source];
          return (
            <div key={source} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-slate-800">{SOURCE_LABEL[source]}</h3>
                {hasData(source) && (
                  <button
                    type="button"
                    onClick={() => deleteSource(source)}
                    disabled={pending}
                    className="text-xs text-red-700 underline hover:text-red-900 disabled:opacity-50"
                  >
                    {recordOf(source)?.period ? "Delete this record" : "Delete all"}
                  </button>
                )}
              </div>

              {recordOf(source)?.period && (
                <p className="mt-1 text-xs text-slate-500">
                  Editing {recordOf(source)!.period}
                  {otherPeriods(source).length > 0
                    ? ` · also on file: ${otherPeriods(source).join(", ")}`
                    : ""}
                </p>
              )}

              {fields.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  {hasData(source)
                    ? "This data isn't a simple list of fields, so it can't be edited here."
                    : (
                      <>
                        No data imported. Add fields by hand, or import a file from{" "}
                        <Link href={`/classes/${student.class_id}#import`} className="underline underline-offset-2">
                          the class page
                        </Link>
                        .
                      </>
                    )}
                </p>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {fields.map((field, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={field.key}
                        onChange={(e) => setField(source, i, { key: e.target.value })}
                        placeholder="Field"
                        className={`w-2/5 ${inputClass}`}
                      />
                      <input
                        type="text"
                        value={field.value}
                        onChange={(e) => setField(source, i, { value: e.target.value })}
                        placeholder="Value"
                        className={`flex-1 ${inputClass}`}
                      />
                      <button
                        type="button"
                        onClick={() => removeField(source, i)}
                        aria-label={`Remove ${field.key || "field"}`}
                        className="rounded px-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {(fields.length > 0 || !hasData(source)) && (
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => saveSource(source)}
                    disabled={pending || (fields.length === 0 && !hasData(source))}
                    className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => addField(source)}
                    className="text-xs text-slate-600 underline hover:text-slate-900"
                  >
                    Add a field
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}
