"use client";

import { useState } from "react";
import type {
  DpGradingQuestion,
  DpMarkAward,
  DpQuestionScheme,
  QuestionRow,
  SaveStatus,
  TranscriptQuestion,
} from "@/lib/types";

function SaveStatusNote({ status }: { status: SaveStatus | undefined }) {
  if (!status) return null;
  if (status.kind === "success") {
    return <span className="text-xs font-medium text-emerald-700">Saved ✓</span>;
  }
  return <span className="text-xs font-medium text-rose-700">{status.message}</span>;
}

/** M1 / (M1) / A1 / R1 / A1ft ... badge, styled by the kind of mark. */
function MarkCodeBadge({ code, implied, ft }: { code: string; implied: boolean; ft: boolean }) {
  const label = implied ? `(${code})` : code;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">
        {label}
      </span>
      {ft && (
        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sky-700">
          ft
        </span>
      )}
    </span>
  );
}

function MarkRow({
  markId,
  code,
  implied,
  ft,
  descriptor,
  award,
  onToggle,
  saving,
  status,
}: {
  markId: string;
  code: string;
  implied: boolean;
  ft: boolean;
  descriptor: string;
  award: DpMarkAward | undefined;
  onToggle: (nextAwarded: boolean) => void;
  saving: boolean;
  status?: SaveStatus;
}) {
  if (!award) {
    return (
      <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-2 text-xs text-slate-400">
        <MarkCodeBadge code={code} implied={implied} ft={ft} /> {descriptor} — not graded yet.
      </div>
    );
  }

  const checked = award.finalAwarded ?? award.conservativeAwarded;
  // Spec P11: highlight where the first-pass proposal disagrees with the
  // conservative second pass — that's what the teacher most needs to check.
  const disagree = award.awarded !== award.conservativeAwarded;

  return (
    <div
      className={`rounded p-2.5 ${
        disagree ? "border border-amber-300 bg-amber-50" : "border border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <MarkCodeBadge code={code} implied={implied} ft={ft} />
            <span className="text-sm text-slate-700">{descriptor}</span>
          </div>
          {award.evidence && (
            <p className="mt-1 text-xs text-slate-600">
              <span className="font-semibold">Evidence: </span>
              {award.evidence}
            </p>
          )}
          {award.note && <p className="mt-1 text-xs italic text-slate-500">{award.note}</p>}
          {disagree && (
            <p className="mt-1 text-[11px] text-amber-700">
              First pass: {award.awarded ? "awarded" : "not awarded"} · Conservative:{" "}
              {award.conservativeAwarded ? "awarded" : "not awarded"}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => onToggle(!checked)}
            disabled={saving}
            aria-pressed={checked}
            aria-label={`${markId}: ${checked ? "awarded" : "not awarded"} — click to toggle`}
            className={`h-7 w-7 rounded-full border text-sm font-bold transition-colors disabled:opacity-50 ${
              checked
                ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
                : "border-slate-300 bg-white text-slate-400 hover:bg-slate-100"
            }`}
          >
            {checked ? "✓" : "✗"}
          </button>
          <SaveStatusNote status={status} />
        </div>
      </div>
    </div>
  );
}

export function DpQuestionPanel({
  question,
  transcript,
  grading,
  onStepTextChange,
  onIllegibleResolvedTextChange,
  onMarkUnreadable,
  onSaveTranscript,
  savingTranscript,
  transcriptStatus,
  onToggleMark,
  savingMarkId,
  markStatus,
}: {
  question: QuestionRow;
  transcript: TranscriptQuestion | null;
  grading: DpGradingQuestion | null;
  onStepTextChange: (stepIndex: number, text: string) => void;
  onIllegibleResolvedTextChange: (flagIndex: number, text: string) => void;
  onMarkUnreadable: (flagIndex: number) => void;
  onSaveTranscript: () => void;
  savingTranscript: boolean;
  transcriptStatus?: SaveStatus;
  onToggleMark: (markId: string, nextAwarded: boolean) => void;
  savingMarkId: string | null;
  markStatus: Record<string, SaveStatus | undefined>;
}) {
  const scheme: DpQuestionScheme | null = question.dp_scheme;
  const [seenFlags, setSeenFlags] = useState<Set<string>>(new Set());

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-base font-semibold tracking-tight">Question {question.number}</h3>
        <span className="text-xs text-slate-500">{question.max_points} marks</span>
      </div>

      {/* Transcript — same editable/illegible-flag UX as MYP, same route. */}
      {!transcript ? (
        <p className="rounded border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-500">
          No transcript yet for this question. Run transcription first.
        </p>
      ) : transcript.blank ? (
        <p className="rounded border border-dashed border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Marked blank — no work submitted for this question.
        </p>
      ) : (
        <div className="space-y-2">
          {transcript.steps.map((step, i) => (
            <textarea
              key={i}
              value={step.text}
              onChange={(e) => onStepTextChange(i, e.target.value)}
              rows={2}
              className={`w-full rounded border px-2 py-1.5 text-sm ${
                step.confident ? "border-slate-300 bg-white" : "border-amber-400 bg-amber-50"
              }`}
              placeholder={`Step ${i + 1}`}
            />
          ))}
          {transcript.steps.some((s) => !s.confident) && (
            <p className="text-xs text-amber-700">
              Amber steps are low-confidence — check against the scan.
            </p>
          )}

          {transcript.illegible.length > 0 && (
            <div className="mt-3 space-y-2 rounded border border-rose-200 bg-rose-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                Illegible flags
              </p>
              {transcript.illegible.map((flag, i) => {
                const status =
                  flag.resolvedText === undefined
                    ? "unresolved"
                    : flag.resolvedText === ""
                      ? "marked unreadable"
                      : "resolved";
                return (
                  <div key={i} className="rounded border border-rose-200 bg-white p-2">
                    <p className="text-xs text-slate-600">
                      Step {flag.stepIndex + 1}: {flag.note}{" "}
                      <span
                        className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                          status === "unresolved"
                            ? "bg-rose-100 text-rose-700"
                            : status === "marked unreadable"
                              ? "bg-slate-200 text-slate-600"
                              : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {status}
                      </span>
                    </p>
                    <div className="mt-1 flex gap-2">
                      <input
                        type="text"
                        value={flag.resolvedText ?? ""}
                        onChange={(e) => onIllegibleResolvedTextChange(i, e.target.value)}
                        placeholder="Type what this segment actually says…"
                        className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => onMarkUnreadable(i)}
                        className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                      >
                        Mark unreadable
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onSaveTranscript}
              disabled={savingTranscript}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {savingTranscript ? "Saving…" : "Save transcript"}
            </button>
            <SaveStatusNote status={transcriptStatus} />
          </div>
        </div>
      )}

      {/* Mark scheme, sub-part by sub-part */}
      {!scheme ? (
        <p className="mt-4 rounded border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-500">
          No DP mark scheme on this question.
        </p>
      ) : !grading ? (
        <p className="mt-4 rounded border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-500">
          No grading yet for this question. Run grading first.
        </p>
      ) : (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          {scheme.subparts.map((subpart, subpartIndex) => {
            const gradingSubpart = grading.subparts?.[subpartIndex];
            const awardsByMarkId = new Map(
              (gradingSubpart?.awards ?? []).map((a) => [a.markId, a])
            );
            return (
              <div key={subpartIndex}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h4 className="text-sm font-semibold text-slate-700">
                    {subpart.label ? `(${subpart.label})` : "Answer"}
                  </h4>
                  <span className="text-xs text-slate-500">[{subpart.maxMarks} marks]</span>
                </div>

                {subpart.notes.length > 0 && (
                  <div className="mb-2 space-y-1">
                    {subpart.notes.map((note, i) => (
                      <p
                        key={i}
                        className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs text-indigo-800"
                      >
                        <span className="font-semibold uppercase tracking-wide">Note: </span>
                        {note}
                      </p>
                    ))}
                  </div>
                )}

                {gradingSubpart?.flags && gradingSubpart.flags.length > 0 && (
                  <div className="mb-2 space-y-1">
                    {gradingSubpart.flags.map((flag, flagIndex) => {
                      const flagKey = `${subpartIndex}-${flagIndex}`;
                      const seen = seenFlags.has(flagKey);
                      return (
                        <div
                          key={flagIndex}
                          className={`flex items-start justify-between gap-2 rounded border px-2 py-1.5 text-xs ${
                            seen
                              ? "border-slate-200 bg-slate-50 text-slate-400"
                              : "border-amber-300 bg-amber-50 text-amber-800"
                          }`}
                        >
                          <span>
                            <span className="font-semibold uppercase tracking-wide">
                              {seen ? "Seen" : "Ambiguous"}:{" "}
                            </span>
                            {flag}
                          </span>
                          {!seen && (
                            <button
                              type="button"
                              onClick={() =>
                                setSeenFlags((s) => new Set(s).add(flagKey))
                              }
                              className="shrink-0 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] font-medium hover:bg-amber-100"
                            >
                              Mark seen
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="space-y-1.5">
                  {subpart.marks.map((mark) => (
                    <MarkRow
                      key={mark.id}
                      markId={mark.id}
                      code={mark.code}
                      implied={mark.implied}
                      ft={mark.ft}
                      descriptor={mark.descriptor}
                      award={awardsByMarkId.get(mark.id)}
                      onToggle={(next) => onToggleMark(mark.id, next)}
                      saving={savingMarkId === mark.id}
                      status={markStatus[mark.id]}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
