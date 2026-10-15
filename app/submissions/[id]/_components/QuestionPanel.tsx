"use client";

import { flagBlocks, questionNeedsReview, stepIsUncertain, stepNeedsCheck } from "@/lib/submissions/review-state";
import { canUseLineAsIs } from "@/lib/submissions/transcript-edits";
import type {
  GradingQuestion,
  QuestionRow,
  SaveStatus,
  SheetDifference,
  TranscriptQuestion,
} from "@/lib/types";

function SaveStatusNote({ status }: { status: SaveStatus | undefined }) {
  if (!status) return null;
  if (status.kind === "success") {
    return <span className="text-xs font-medium text-emerald-700">Saved ✓</span>;
  }
  return <span className="text-xs font-medium text-rose-700">{status.message}</span>;
}

export function QuestionPanel({
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
  onFinalPointsChange,
  onSaveGrading,
  savingGrading,
  gradingStatus,
  difference,
  settling,
  onSettleDifference,
}: {
  question: QuestionRow;
  transcript: TranscriptQuestion | null;
  grading: GradingQuestion | null;
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
  onFinalPointsChange: (points: number) => void;
  onSaveGrading: () => void;
  savingGrading: boolean;
  gradingStatus?: SaveStatus;
  /** The teacher's uploaded sheet disagrees with the app's mark here. */
  difference: (SheetDifference & { current: number }) | null;
  settling: boolean;
  onSettleDifference: (choice: "mine" | "app") => void;
}) {
  const disagree =
    grading && grading.proposedPoints !== grading.conservativePoints;

  // The question still wants your eyes on the transcript. A disagreement with
  // your own marking sheet outranks it: that one is about the grade, this one is
  // about whether the tool read the paper correctly.
  const needsReview = !difference && questionNeedsReview(transcript ?? undefined);

  // Indigo where the teacher gave more than the app, rose where they gave less.
  const tone = !difference
    ? null
    : difference.sheet > difference.current
      ? {
          panel: "border-indigo-400 ring-1 ring-indigo-300",
          box: "border-indigo-300 bg-indigo-50 text-indigo-950",
          button: "bg-indigo-700 hover:bg-indigo-600",
        }
      : {
          panel: "border-rose-400 ring-1 ring-rose-300",
          box: "border-rose-300 bg-rose-50 text-rose-950",
          button: "bg-rose-700 hover:bg-rose-600",
        };

  return (
    // The id lets the marks summary and the marks import link straight here.
    <div
      id={`q-${question.id}`}
      className={`scroll-mt-4 rounded-lg border bg-white p-5 ${
        tone ? tone.panel : needsReview ? "border-amber-300" : "border-slate-200"
      }`}
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-base font-semibold tracking-tight">
          Question {question.number}
        </h3>
        <span className="flex items-baseline gap-2 text-xs text-slate-500">
          {needsReview && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">
              Unreadable part to fix
            </span>
          )}
          <span>
            {question.max_points} pts
            {question.level_band ? ` · Level band ${question.level_band}` : ""}
          </span>
        </span>
      </div>

      {difference && tone && (
        <div className={`mb-4 rounded border p-3 text-sm ${tone.box}`}>
          <p className="font-semibold">
            Your sheet: {difference.sheet}/{question.max_points} · App: {difference.current}/
            {question.max_points}{" "}
            <span className="font-normal">
              — you gave {Math.abs(difference.sheet - difference.current)}{" "}
              {difference.sheet > difference.current ? "more" : "less"}
              {difference.fromBlank ? " (the cell on your sheet was blank, read as 0)" : ""}
            </span>
          </p>
          {grading && (
            <p className="mt-2">
              <span className="font-semibold">Why the app gave {difference.current}: </span>
              {grading.evidence || "No justification was recorded."}
            </p>
          )}
          {grading && disagree && grading.conservativeArgument && (
            <p className="mt-1">
              <span className="font-semibold">
                Second pass ({grading.conservativePoints} vs {grading.proposedPoints} proposed):{" "}
              </span>
              {grading.conservativeArgument}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onSettleDifference("mine")}
              disabled={settling}
              className={`rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 ${tone.button}`}
            >
              Use my mark ({difference.sheet})
            </button>
            <button
              type="button"
              onClick={() => onSettleDifference("app")}
              disabled={settling}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
            >
              Keep the app&apos;s mark ({difference.current})
            </button>
            {settling && <span className="text-xs">Saving…</span>}
          </div>
        </div>
      )}

      {/* Transcript */}
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
              {/* Not the same as unreadable: this line is legible, it just is
                  not part of the answer. Grading never sees it, and the text
                  stays on record. */}
              <button
                type="button"
                onClick={() => onToggleStepOmitted(i)}
                title={
                  step.omitted
                    ? "Put this line back into the answer"
                    : "This line is not part of the answer — leave it out of grading"
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

      {/* Grading */}
      {grading && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div
            className={`grid grid-cols-2 gap-3 rounded p-3 ${
              disagree ? "bg-amber-50 border border-amber-300" : "bg-slate-50"
            }`}
          >
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">Proposed</p>
              <p className="text-lg font-semibold">
                {grading.proposedPoints} / {question.max_points}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">Conservative</p>
              <p className="text-lg font-semibold">
                {grading.conservativePoints} / {question.max_points}
              </p>
            </div>
          </div>

          {disagree && grading.conservativeArgument && (
            <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
              <span className="font-semibold">Conservative argument: </span>
              {grading.conservativeArgument}
            </p>
          )}

          <p className="mt-2 text-sm text-slate-700">
            <span className="font-semibold">Evidence: </span>
            {grading.evidence}
          </p>

          {grading.followThrough && (
            <span className="mt-2 inline-block rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sky-700">
              Follow-through applied
            </span>
          )}

          <div className="mt-3 flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600">Final points</label>
            <input
              type="number"
              min={0}
              max={question.max_points}
              step="any"
              value={grading.finalPoints ?? grading.conservativePoints}
              onChange={(e) => onFinalPointsChange(Number(e.target.value))}
              className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={onSaveGrading}
              disabled={savingGrading}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {savingGrading ? "Saving…" : "Save"}
            </button>
            <SaveStatusNote status={gradingStatus} />
          </div>
        </div>
      )}
    </div>
  );
}
