"use client";

import { useState } from "react";
import type {
  DpGradingQuestion,
  DpMarkAward,
  DpQuestionScheme,
  QuestionRow,
  SaveStatus,
  TranscriptQuestion,
  SheetDifference,
} from "@/lib/types";
import { flagBlocks, questionNeedsReview, stepIsUncertain, stepNeedsCheck } from "@/lib/submissions/review-state";
import { canUseLineAsIs } from "@/lib/submissions/transcript-edits";
import { partDisplay, sheetQuestionLabel } from "@/lib/marks-import/labels";

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
  onUseLineAsIs,
  onAcceptAsItStands,
  onToggleStepOmitted,
  onSaveTranscript,
  savingTranscript,
  transcriptStatus,
  onToggleMark,
  savingMarkId,
  markStatus,
  differences = [],
  settlingParts = {},
  onSettleDifference,
}: {
  question: QuestionRow;
  transcript: TranscriptQuestion | null;
  grading: DpGradingQuestion | null;
  onStepTextChange: (stepIndex: number, text: string) => void;
  onIllegibleResolvedTextChange: (flagIndex: number, text: string) => void;
  onMarkUnreadable: (flagIndex: number) => void;
  /** The flagged line is right as it reads. */
  onUseLineAsIs: (flagIndex: number) => void;
  /** The whole question as it stands: what the old Save button did. */
  onAcceptAsItStands: () => void;
  /** Take a line out of the answer, or put it back. */
  onToggleStepOmitted: (stepIndex: number) => void;
  onSaveTranscript: () => void;
  savingTranscript: boolean;
  transcriptStatus?: SaveStatus;
  onToggleMark: (markId: string, nextAwarded: boolean) => void;
  savingMarkId: string | null;
  markStatus: Record<string, SaveStatus | undefined>;
  /** Where the teacher's uploaded sheet disagrees: the whole question, or some of its parts. */
  differences?: (SheetDifference & { current: number })[];
  /** Which of those are being saved, keyed "<questionId>:<part>". */
  settlingParts?: Record<string, boolean>;
  onSettleDifference?: (difference: SheetDifference, choice: "mine" | "app") => void;
}) {
  const scheme: DpQuestionScheme | null = question.dp_scheme;
  const [seenFlags, setSeenFlags] = useState<Set<string>>(new Set());
  // The question still wants your eyes on the transcript — the same rule the
  // marks strip colours its chip by, so the two always agree.
  // A disagreement with the teacher's own sheet outranks it, as on MYP: that one is
  // about the grade, this one about whether the paper was read correctly.
  const needsReview = differences.length === 0 && questionNeedsReview(transcript ?? undefined);
  const sheetGaveMore = differences.reduce((sum, d) => sum + (d.sheet - d.current), 0) >= 0;
  const border =
    differences.length > 0
      ? sheetGaveMore
        ? "border-indigo-400 ring-1 ring-indigo-300"
        : "border-rose-400 ring-1 ring-rose-300"
      : needsReview
        ? "border-amber-300"
        : "border-slate-200";

  return (
    <div className={`rounded-lg border bg-white p-5 ${border}`}>
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-base font-semibold tracking-tight">Question {question.number}</h3>
        <span className="flex items-baseline gap-2 text-xs text-slate-500">
          {needsReview && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">
              Unreadable part to fix
            </span>
          )}
          <span>{question.max_points} marks</span>
        </span>
      </div>

      {differences.map((d) => {
        const more = d.sheet > d.current;
        const key = `${d.questionId}:${d.part}`;
        return (
          <div
            key={key}
            className={`mb-3 rounded border p-3 text-sm ${
              more ? "border-indigo-300 bg-indigo-50 text-indigo-950" : "border-rose-300 bg-rose-50 text-rose-950"
            }`}
          >
            <p className="font-semibold">
              Your sheet: {sheetQuestionLabel(d.questionNumber, d.part)} {d.sheet}/{d.maxPoints} · App: {d.current}/
              {d.maxPoints}{" "}
              <span className="font-normal">
                — you gave {Math.abs(d.sheet - d.current)} {more ? "more" : "less"}
                {d.fromBlank ? " (the cell on your sheet was blank, read as 0)" : ""}
              </span>
            </p>
            <p className="mt-1 text-xs">
              The marks the app gave{d.part ? ` for part ${partDisplay(d.part)}` : ""} are ticked below, each
              with its reason.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onSettleDifference?.(d, "mine")}
                disabled={!!settlingParts[key]}
                className={`rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 ${
                  more ? "bg-indigo-700 hover:bg-indigo-600" : "bg-rose-700 hover:bg-rose-600"
                }`}
              >
                Use my mark ({d.sheet})
              </button>
              <button
                type="button"
                onClick={() => onSettleDifference?.(d, "app")}
                disabled={!!settlingParts[key]}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
              >
                Keep the app&apos;s mark ({d.current})
              </button>
              {settlingParts[key] && <span className="text-xs">Saving…</span>}
            </div>
          </div>
        );
      })}

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
            <div key={i} className="flex items-start gap-2">
              <textarea
                value={step.text}
                onChange={(e) => onStepTextChange(i, e.target.value)}
                rows={2}
                disabled={step.omitted}
                className={`w-full rounded border px-2 py-1.5 text-sm ${
                  step.omitted
                    ? "border-slate-200 bg-slate-50 text-slate-400 line-through"
                    : stepNeedsCheck(transcript, i)
                      ? "border-amber-400 bg-amber-50"
                      : stepIsUncertain(transcript, i)
                        ? "border-sky-200 bg-sky-50"
                        : "border-slate-300 bg-white"
                }`}
                title={
                  stepNeedsCheck(transcript, i)
                    ? "Part of this line couldn't be read — fix it, or mark it unreadable, before grading."
                    : stepIsUncertain(transcript, i)
                      ? "The AI was less sure of this line — worth a glance at the scan, not required."
                      : undefined
                }
                placeholder={`Step ${i + 1}`}
              />
              {/* Not the same as unreadable: this line is legible, it just is not
                  part of the answer. The marking never sees it, and the text stays
                  on record — as on MYP. */}
              <button
                type="button"
                onClick={() => onToggleStepOmitted(i)}
                title={
                  step.omitted
                    ? "Put this line back into the answer"
                    : "This line is not part of the answer — leave it out of the marking"
                }
                className="mt-1 shrink-0 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
              >
                {step.omitted ? "Restore" : "Not part of the answer"}
              </button>
            </div>
          ))}
          {transcript.steps.some((_, i) => stepNeedsCheck(transcript, i)) && (
            <p className="text-xs text-amber-700">
              Orange lines have a part the AI couldn&apos;t read ([?]) — fix it, or mark it unreadable.
              Grading waits for these.
            </p>
          )}
          {transcript.steps.some((_, i) => stepIsUncertain(transcript, i)) && (
            <p className="text-xs text-sky-700">
              Blue lines are ones the AI was less sure of — worth a glance at the scan, not required.
            </p>
          )}

          {transcript.illegible.some((f) => !transcript.steps[f.stepIndex]?.omitted) && (
            <div className="mt-3 space-y-2 rounded border border-rose-200 bg-rose-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                Illegible flags
              </p>
              <p className="text-xs text-rose-700/80">
                Fix the line above and its flag clears once no “[?]” is left in it. Or type what it says
                here, use the line as it is, or mark it unreadable (no credit). Only a line still showing
                “[?]” holds up grading.
              </p>
              {transcript.illegible.map((flag, i) => {
                // A line taken out of the answer needs no reading.
                if (transcript.steps[flag.stepIndex]?.omitted) return null;
                const status =
                  flag.resolvedText === undefined
                    ? flagBlocks(transcript, flag)
                      ? "to fix"
                      : "worth a glance"
                    : flag.resolvedText === ""
                      ? "marked unreadable"
                      : "resolved";
                return (
                  <div key={i} className="rounded border border-rose-200 bg-white p-2">
                    <p className="text-xs text-slate-600">
                      Step {flag.stepIndex + 1}: {flag.note}{" "}
                      <span
                        className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                          status === "to fix"
                            ? "bg-rose-100 text-rose-700"
                            : status === "worth a glance"
                              ? "bg-sky-100 text-sky-800"
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
                      {canUseLineAsIs(transcript, i) && (
                        <button
                          type="button"
                          onClick={() => onUseLineAsIs(i)}
                          className="shrink-0 rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-50"
                        >
                          Use the line as it is
                        </button>
                      )}
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

          {/* Edits save themselves; this only says how that is going. */}
          <div className="mt-2 flex min-h-6 flex-wrap items-center gap-2 text-xs text-slate-500">
            {transcript.steps.some(
              (_, i) => stepNeedsCheck(transcript, i) || stepIsUncertain(transcript, i)
            ) && (
              <button
                type="button"
                onClick={() => {
                  const unreadable = transcript.steps.filter((_, i) => stepNeedsCheck(transcript, i)).length;
                  if (
                    unreadable > 0 &&
                    !window.confirm(
                      `Accept this question as it stands?\n\n${unreadable} line${unreadable === 1 ? " still shows" : "s still show"} “[?]” and will count as unreadable (no credit). Every other line is used as written.`
                    )
                  ) {
                    return;
                  }
                  onAcceptAsItStands();
                }}
                title="Use every line as written — what Save used to do. Lines still showing [?] count as unreadable."
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-800 hover:bg-slate-100"
              >
                Accept as it stands
              </button>
            )}
            {savingTranscript ? (
              <span>Saving…</span>
            ) : transcriptStatus?.kind === "error" ? (
              <>
                <span className="font-medium text-rose-700">{transcriptStatus.message}</span>
                <button
                  type="button"
                  onClick={onSaveTranscript}
                  className="rounded border border-rose-300 px-2 py-0.5 font-medium text-rose-700 hover:bg-rose-50"
                >
                  Try again
                </button>
              </>
            ) : transcriptStatus?.kind === "success" ? (
              <span className="font-medium text-emerald-700">Saved ✓</span>
            ) : (
              <span>Changes save automatically.</span>
            )}
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
          {typeof grading.teacherPoints === "number" && (
            <p className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900">
              <span className="font-semibold">
                Your mark: {grading.teacherPoints}/{question.max_points}
              </span>{" "}
              — from your marks sheet, for the whole question. The ticks below are the app&apos;s own
              marking; toggling one goes back to them.
            </p>
          )}
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
                {typeof gradingSubpart?.teacherPoints === "number" && (
                  <p className="mb-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900">
                    <span className="font-semibold">
                      Your mark: {gradingSubpart.teacherPoints}/{subpart.maxMarks}
                    </span>{" "}
                    — from your marks sheet. The ticks below are the app&apos;s own marking; toggling one
                    goes back to them.
                  </p>
                )}

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
