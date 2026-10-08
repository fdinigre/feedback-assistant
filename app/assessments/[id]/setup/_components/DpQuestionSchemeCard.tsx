"use client";

import { useState } from "react";
import type { DpQuestionScheme, DpSchemeMark, DpSubpart, QuestionRow } from "@/lib/types";
import { saveDpQuestionScheme } from "../actions";

const EMPTY_SCHEME: DpQuestionScheme = { subparts: [{ label: "", maxMarks: 0, scheme: "", marks: [], notes: [] }], totalMarks: 0 };

function newMark(subpartLabel: string, index: number): DpSchemeMark {
  return { id: `${subpartLabel || "q"}-${index}`, code: "", implied: false, ft: false, value: 1, descriptor: "" };
}

/**
 * Per-question DP markscheme parse editor (spec P4): shows the scheme verbatim, marks
 * (code/implied/ft/value/descriptor/alt) and notes, all editable. Saving one question does
 * not approve the whole parse — "Approve parse" is a separate, explicit gate (spec edge case:
 * the assessment does not activate until the structure is approved).
 */
export function DpQuestionSchemeCard({
  assessmentId,
  question,
}: {
  assessmentId: number;
  question: QuestionRow;
}) {
  const [scheme, setScheme] = useState<DpQuestionScheme>(question.dp_scheme ?? EMPTY_SCHEME);
  const [dirty, setDirty] = useState(false);
  const action = saveDpQuestionScheme.bind(null, assessmentId, question.id);

  function update(next: DpQuestionScheme) {
    setScheme(next);
    setDirty(true);
  }

  function updateSubpart(idx: number, patch: Partial<DpSubpart>) {
    const subparts = scheme.subparts.map((sp, i) => (i === idx ? { ...sp, ...patch } : sp));
    update({ ...scheme, subparts });
  }

  function updateMark(spIdx: number, markIdx: number, patch: Partial<DpSchemeMark>) {
    const subparts = scheme.subparts.map((sp, i) => {
      if (i !== spIdx) return sp;
      const marks = sp.marks.map((m, j) => (j === markIdx ? { ...m, ...patch } : m));
      return { ...sp, marks };
    });
    update({ ...scheme, subparts });
  }

  function addSubpart() {
    update({ ...scheme, subparts: [...scheme.subparts, { label: "", maxMarks: 0, scheme: "", marks: [], notes: [] }] });
  }

  function removeSubpart(idx: number) {
    update({ ...scheme, subparts: scheme.subparts.filter((_, i) => i !== idx) });
  }

  function addMark(spIdx: number) {
    const subparts = scheme.subparts.map((sp, i) =>
      i === spIdx ? { ...sp, marks: [...sp.marks, newMark(sp.label, sp.marks.length + 1)] } : sp
    );
    update({ ...scheme, subparts });
  }

  function removeMark(spIdx: number, markIdx: number) {
    const subparts = scheme.subparts.map((sp, i) =>
      i === spIdx ? { ...sp, marks: sp.marks.filter((_, j) => j !== markIdx) } : sp
    );
    update({ ...scheme, subparts });
  }

  function addNote(spIdx: number) {
    const subparts = scheme.subparts.map((sp, i) => (i === spIdx ? { ...sp, notes: [...sp.notes, ""] } : sp));
    update({ ...scheme, subparts });
  }

  function updateNote(spIdx: number, noteIdx: number, value: string) {
    const subparts = scheme.subparts.map((sp, i) => {
      if (i !== spIdx) return sp;
      return { ...sp, notes: sp.notes.map((n, j) => (j === noteIdx ? value : n)) };
    });
    update({ ...scheme, subparts });
  }

  function removeNote(spIdx: number, noteIdx: number) {
    const subparts = scheme.subparts.map((sp, i) =>
      i === spIdx ? { ...sp, notes: sp.notes.filter((_, j) => j !== noteIdx) } : sp
    );
    update({ ...scheme, subparts });
  }

  const computedTotal = scheme.subparts.reduce((sum, sp) => sum + (Number(sp.maxMarks) || 0), 0);

  return (
    <form
      action={action}
      className="rounded-md border border-slate-200 p-4"
      onSubmit={() => setDirty(false)}
    >
      <input type="hidden" name="scheme_json" value={JSON.stringify(scheme)} readOnly />
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Question {question.number}</h3>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Total marks (sum of sub-parts): {computedTotal}</span>
          {computedTotal !== scheme.totalMarks && (
            <span className="text-amber-700">markscheme says {scheme.totalMarks}</span>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-4">
        {scheme.subparts.map((sp, spIdx) => (
          <div key={spIdx} className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-medium text-slate-600">Part</label>
              <input
                value={sp.label}
                onChange={(e) => updateSubpart(spIdx, { label: e.target.value })}
                placeholder="e.g. a, b.i"
                className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
              />
              <label className="text-xs font-medium text-slate-600">Max marks</label>
              <input
                type="number"
                step="1"
                min="0"
                value={sp.maxMarks}
                onChange={(e) => updateSubpart(spIdx, { maxMarks: Number(e.target.value) })}
                className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => removeSubpart(spIdx)}
                className="ml-auto rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                Remove part
              </button>
            </div>

            <label className="mt-2 block text-xs font-medium text-slate-600">
              Scheme text (verbatim)
            </label>
            <textarea
              value={sp.scheme}
              onChange={(e) => updateSubpart(spIdx, { scheme: e.target.value })}
              rows={3}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm font-mono"
            />

            <div className="mt-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-600">Marks</label>
                <button
                  type="button"
                  onClick={() => addMark(spIdx)}
                  className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100"
                >
                  + Add mark
                </button>
              </div>
              <div className="mt-1 space-y-1.5">
                {sp.marks.map((m, markIdx) => (
                  <div
                    key={m.id}
                    className="grid grid-cols-2 gap-1.5 rounded border border-slate-200 bg-white p-2 sm:grid-cols-[70px_60px_50px_60px_1fr_90px_auto] sm:items-center"
                  >
                    <input
                      value={m.code}
                      onChange={(e) => updateMark(spIdx, markIdx, { code: e.target.value })}
                      placeholder="M1"
                      className="rounded border border-slate-300 px-1.5 py-1 text-xs font-mono"
                    />
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={m.implied}
                        onChange={(e) => updateMark(spIdx, markIdx, { implied: e.target.checked })}
                      />
                      implied
                    </label>
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={m.ft}
                        onChange={(e) => updateMark(spIdx, markIdx, { ft: e.target.checked })}
                      />
                      ft
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={m.value}
                      onChange={(e) => updateMark(spIdx, markIdx, { value: Number(e.target.value) })}
                      className="rounded border border-slate-300 px-1.5 py-1 text-xs"
                    />
                    <input
                      value={m.descriptor}
                      onChange={(e) => updateMark(spIdx, markIdx, { descriptor: e.target.value })}
                      placeholder="what this mark is for"
                      className="rounded border border-slate-300 px-1.5 py-1 text-xs"
                    />
                    <input
                      value={m.alt ?? ""}
                      onChange={(e) => updateMark(spIdx, markIdx, { alt: e.target.value || undefined })}
                      placeholder="alt group"
                      className="rounded border border-slate-300 px-1.5 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => removeMark(spIdx, markIdx)}
                      className="rounded border border-red-200 px-1.5 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {sp.marks.length === 0 && (
                  <p className="text-xs text-slate-400">No marks yet.</p>
                )}
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-600">
                  Notes (binding — see spec P4/P8)
                </label>
                <button
                  type="button"
                  onClick={() => addNote(spIdx)}
                  className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100"
                >
                  + Add note
                </button>
              </div>
              <div className="mt-1 space-y-1.5">
                {sp.notes.map((note, noteIdx) => (
                  <div key={noteIdx} className="flex items-start gap-1.5">
                    <textarea
                      value={note}
                      onChange={(e) => updateNote(spIdx, noteIdx, e.target.value)}
                      rows={2}
                      className="w-full rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => removeNote(spIdx, noteIdx)}
                      className="rounded border border-red-200 px-1.5 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={addSubpart}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
        >
          + Add part
        </button>
        <label className="ml-auto text-xs font-medium text-slate-600">Total marks (markscheme)</label>
        <input
          type="number"
          step="1"
          min="0"
          value={scheme.totalMarks}
          onChange={(e) => update({ ...scheme, totalMarks: Number(e.target.value) })}
          className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          Save question
        </button>
        {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
      </div>
    </form>
  );
}
