"use client";

import { useLayoutEffect, useRef } from "react";
import type { ReportSections, ReportStatus } from "@/lib/types";
import { ATL_LEVELS, EVIDENCEABLE_CLUSTERS } from "@/lib/atl/rubric";

/**
 * A textarea that is always exactly as tall as what it holds.
 *
 * These boxes carry whole paragraphs of feedback, and a fixed row count meant
 * reading each bullet by scrolling inside a two-line window — with no way to see
 * a point in full, let alone compare it with the next one.
 */
function AutoTextarea({
  value,
  onChange,
  minRows = 2,
  className = "",
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  minRows?: number;
  className?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Measured after layout and before paint, so the box never flashes at the
  // wrong height — including when the text is replaced by a fresh generation.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // scrollHeight covers content + padding. These boxes are border-box, so the
    // border has to be added back or the last line is clipped by a pixel or two.
    const style = getComputedStyle(el);
    const border =
      style.boxSizing === "border-box"
        ? parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
        : 0;
    el.style.height = `${el.scrollHeight + border}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={minRows}
      placeholder={placeholder}
      // The height is driven by the content, so neither a scrollbar nor a drag
      // handle has anything to do.
      style={{ overflow: "hidden", resize: "none" }}
      className={className}
    />
  );
}

function wordCount(text: string): number {
  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
}

function EditableList({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{label}</h3>
      <div className="mt-2 space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <AutoTextarea
              value={item}
              onChange={(value) => {
                const next = [...items];
                next[i] = value;
                onChange(next);
              }}
              className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
            >
              Remove
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-xs italic text-slate-400">No items yet.</p>
        )}
        <button
          type="button"
          onClick={() => onChange([...items, ""])}
          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
        >
          + Add bullet
        </button>
      </div>
    </div>
  );
}

export function ReportEditor({
  sections,
  onChange,
  onSave,
  saving,
  onApprove,
  approving,
  status,
}: {
  sections: ReportSections;
  onChange: (sections: ReportSections) => void;
  onSave: () => void;
  saving: boolean;
  onApprove: () => void;
  approving: boolean;
  status: ReportStatus | null;
}) {
  const words = wordCount(sections.feedbackComment);
  const wordsOutOfRange = words > 0 && (words < 60 || words > 100);

  return (
    // Anchored: "still a draft" warnings elsewhere link straight here.
    <div id="report" className="scroll-mt-4 space-y-5 rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Report</h2>
        {status && (
          <span
            className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${
              status === "approved"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {status}
          </span>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Data Correlation (Internal Insight)
        </h3>
        <AutoTextarea
          value={sections.dataCorrelation ?? ""}
          onChange={(value) =>
            onChange({ ...sections, dataCorrelation: value === "" ? null : value })
          }
          minRows={3}
          placeholder="No external data (MAP/CAT4) on file for this student."
          className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>

      <EditableList
        label="Strengths"
        items={sections.strengths}
        onChange={(items) => onChange({ ...sections, strengths: items })}
      />
      <EditableList
        label="Areas for Improvement"
        items={sections.areasForImprovement}
        onChange={(items) => onChange({ ...sections, areasForImprovement: items })}
      />
      <EditableList
        label="Actionable Steps"
        items={sections.actionableSteps}
        onChange={(items) => onChange({ ...sections, actionableSteps: items })}
      />

      <div>
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Feedback Comment (Toddle)
          </h3>
          <span className={`text-xs ${wordsOutOfRange ? "font-semibold text-amber-600" : "text-slate-400"}`}>
            {words} words
          </span>
        </div>
        <AutoTextarea
          value={sections.feedbackComment}
          onChange={(value) => onChange({ ...sections, feedbackComment: value })}
          minRows={4}
          className={`mt-2 w-full rounded border px-2 py-1.5 text-sm ${
            wordsOutOfRange ? "border-amber-400 bg-amber-50" : "border-slate-300"
          }`}
        />
        {wordsOutOfRange && (
          <p className="mt-1 text-xs text-amber-700">
            Outside the usual 60–100 word range — double check before approving.
          </p>
        )}
      </div>

      {/* The comment above carries one ATL skill in ordinary words. This says
          which, so it is reportable later — and it is never shown to the
          student, which is why the evidence line can be blunt. */}
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Approach to learning
          </h3>
          <span className="text-xs text-slate-500">Yours, not the student&rsquo;s</span>
        </div>
        {sections.atlFocus ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded bg-slate-200 px-2 py-0.5 font-medium">
              {sections.atlFocus.cluster}
            </span>
            <select
              value={sections.atlFocus.level}
              onChange={(e) =>
                onChange({
                  ...sections,
                  atlFocus: { ...sections.atlFocus!, level: e.target.value },
                })
              }
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            >
              {ATL_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onChange({ ...sections, atlFocus: null })}
              className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
            >
              Clear
            </button>
            {sections.atlFocus.evidence && (
              <p className="w-full text-xs leading-relaxed text-slate-600">
                {sections.atlFocus.evidence}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-sm text-slate-500">
              Nothing recorded for this paper.
            </p>
            {EVIDENCEABLE_CLUSTERS.map((cluster) => (
              <button
                key={cluster}
                type="button"
                onClick={() =>
                  onChange({
                    ...sections,
                    atlFocus: { cluster, level: "Independent", evidence: "" },
                  })
                }
                className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
              >
                + {cluster}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-md border border-indigo-200 bg-indigo-50/60 p-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Student report comment (Toddle)
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Longer, plain-language version for the student: a short intro plus what went well, what to
          work on, and next steps. Copy it with the student&rsquo;s name filled in from Outputs (after
          approving).
        </p>
        <AutoTextarea
          value={sections.toddleReport ?? ""}
          onChange={(value) => onChange({ ...sections, toddleReport: value })}
          minRows={6}
          placeholder="Generate the report to fill this in, or write it yourself."
          className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>

      <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save draft"}
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={approving || status === "approved"}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {status === "approved"
            ? "Approved"
            : approving
              ? "Approving…"
              : "Approve report"}
        </button>
      </div>
    </div>
  );
}
