"use client";

import type { DpGradingQuestion, GradeBoundary, QuestionRow, SheetDifference, TranscriptQuestion } from "@/lib/types";
import { sheetQuestionLabel } from "@/lib/marks-import/labels";
import { liveSubmissionStats, pickFinal, pickProposed, sumQuestionMarks } from "@/lib/submissions/dp-calc";
import { questionNeedsReview } from "@/lib/submissions/review-state";

/**
 * Top strip for the DP review screen (spec P11): one chip per question with
 * final/max marks, then the overall total, percentage and grade 1-7 — all
 * recalculated live from whatever is in `gradingByQuestionId` on every
 * render, so a mark toggle updates this instantly with no round trip. The
 * conservative total is shown as a small, deliberately de-emphasized
 * reference next to it.
 *
 * Like the MYP strip, every chip is a button that brings its question into view
 * beside the scan, and an amber chip is one with a part the AI couldn't read ([?])
 * still to fix — so the questions to look at are found from the top, not by scrolling.
 * A question whose marks differ from the teacher's uploaded sheet is indigo where
 * the sheet gave more and rose where it gave less, showing both totals; that
 * outranks the amber, since it is about the grade rather than the reading.
 */
export function DpMarksSummary({
  questions,
  gradingByQuestionId,
  boundaries,
  transcriptByQuestionId,
  differencesByQuestionId,
  selectedQuestionId,
  onSelect,
}: {
  questions: QuestionRow[];
  gradingByQuestionId: Map<number, DpGradingQuestion>;
  boundaries: GradeBoundary[];
  transcriptByQuestionId: Record<number, TranscriptQuestion>;
  /** The teacher's sheet against the app, per question — a whole question or its parts. */
  differencesByQuestionId: Map<number, (SheetDifference & { current: number })[]>;
  /** The question last brought into view from here. */
  selectedQuestionId: number | null;
  onSelect: (questionId: number) => void;
}) {
  if (questions.length === 0) return null;

  const stats = liveSubmissionStats(questions, gradingByQuestionId, boundaries);
  const hasAnyGrading = questions.some((q) => gradingByQuestionId.has(q.id));
  const reviewCount = questions.filter(
    (q) => !differencesByQuestionId.has(q.id) && questionNeedsReview(transcriptByQuestionId[q.id])
  ).length;
  const differenceCount = [...differencesByQuestionId.values()].reduce((n, list) => n + list.length, 0);

  return (
    // Pinned, as on MYP: the chips are how you move between questions, so they
    // have to stay reachable while the columns below fill the screen.
    <div className="sticky top-0 z-20 mb-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 shadow-[0_6px_12px_-10px_rgba(28,27,24,0.5)]">
      <div className="flex flex-wrap items-center gap-y-1 text-sm">
        <span className="mr-2 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Marks
        </span>
        {questions.map((question, i) => {
          const content = gradingByQuestionId.get(question.id) ?? null;
          const finalPoints = content ? sumQuestionMarks(content, question.dp_scheme, pickFinal) : null;
          const proposedPoints = content ? sumQuestionMarks(content, question.dp_scheme, pickProposed) : null;
          const disagree = content !== null && finalPoints !== proposedPoints;
          const review = questionNeedsReview(transcriptByQuestionId[question.id]);
          const selected = question.id === selectedQuestionId;
          const differences = differencesByQuestionId.get(question.id) ?? [];
          // The question's total as the teacher's sheet would have it: the app's,
          // moved by every part (or the whole) the sheet marks differently.
          const sheetTotal =
            differences.length > 0 && finalPoints !== null
              ? finalPoints + differences.reduce((sum, d) => sum + (d.sheet - d.current), 0)
              : null;
          const tone =
            sheetTotal !== null
              ? sheetTotal >= (finalPoints ?? 0)
                ? "bg-indigo-100 text-indigo-900 hover:bg-indigo-200"
                : "bg-rose-100 text-rose-900 hover:bg-rose-200"
              : review
                ? "bg-amber-100 text-amber-900 hover:bg-amber-200"
                : "text-slate-700 hover:bg-slate-200";
          return (
            <span key={question.id} className="inline-flex items-center whitespace-nowrap">
              {i > 0 && <span className="mx-1.5 text-slate-300">·</span>}
              <button
                type="button"
                onClick={() => onSelect(question.id)}
                title={
                  differences.length > 0
                    ? `Your sheet differs: ${differences
                        .map((d) => `${sheetQuestionLabel(d.questionNumber, d.part)} yours ${d.sheet}, app ${d.current}`)
                        .join("; ")}. Click to check.`
                    : review
                      ? "A part the AI couldn't read ([?]) still to fix — click to open it. Grading waits for it."
                      : `Show question ${question.number}`
                }
                aria-pressed={selected}
                className={`rounded px-1.5 py-0.5 font-medium ${tone} ${
                  selected ? "ring-2 ring-slate-900 ring-offset-1" : ""
                }`}
              >
                Q{question.number}
                <span className="ml-1 opacity-75">
                  {finalPoints ?? "—"}/{question.max_points}
                </span>
                {sheetTotal !== null && (
                  <span className="ml-1 font-semibold">
                    · yours {sheetTotal} {sheetTotal > (finalPoints ?? 0) ? "▲" : sheetTotal < (finalPoints ?? 0) ? "▼" : ""}
                  </span>
                )}
              </button>
              {disagree && (
                <span
                  role="img"
                  aria-label={`proposed score: ${proposedPoints}`}
                  title={`first-pass proposed: ${proposedPoints}`}
                  className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500"
                />
              )}
            </span>
          );
        })}
        {hasAnyGrading && (
          <span className="ml-3 shrink-0 whitespace-nowrap border-l border-slate-300 pl-3 font-semibold text-slate-800">
            Total {stats.total}/{stats.max} · {stats.pct.toFixed(1)}% · Grade {stats.grade}
          </span>
        )}
      </div>

      {reviewCount > 0 && (
        <p className="mt-2 text-xs text-slate-600">
          <span className="rounded bg-amber-100 px-1 font-semibold text-amber-900">
            {reviewCount} question{reviewCount === 1 ? "" : "s"} to check
          </span>{" "}
          — each has a part the AI couldn&apos;t read ([?]), which grading waits for. Click one to open it.
        </p>
      )}

      {differenceCount > 0 && (
        <p className="mt-2 text-xs text-slate-600">
          <span className="font-semibold">
            {differenceCount} mark{differenceCount === 1 ? "" : "s"} differ
            {differenceCount === 1 ? "s" : ""} from your sheet.
          </span>{" "}
          <span className="rounded bg-indigo-100 px-1 text-indigo-900">▲ you gave more</span>{" "}
          <span className="rounded bg-rose-100 px-1 text-rose-900">▼ you gave less</span> — click one
          to open it.
        </p>
      )}

      {hasAnyGrading && stats.conservativeTotal !== stats.total && (
        <p className="mt-1.5 text-xs text-slate-400">
          Conservative total (reference): {stats.conservativeTotal}/{stats.max}
        </p>
      )}
    </div>
  );
}
