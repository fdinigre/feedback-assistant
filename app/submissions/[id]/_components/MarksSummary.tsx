"use client";

import type {
  CriterionLevelRow,
  GradingQuestion,
  QuestionRow,
  SheetDifference,
  TranscriptQuestion,
} from "@/lib/types";
import { questionNeedsReview } from "@/lib/submissions/review-state";

/**
 * Compact "at a glance" strip so the teacher can check the tool's marks
 * against their own paper marking without scrolling. Renders as a dense
 * horizontal chip row (one chip per question, in natural question order)
 * plus a criterion-level chip row. An amber dot flags any question where
 * the proposed score was higher than the conservative one on record. A question whose mark
 * differs from the teacher's uploaded sheet is a coloured chip showing both
 * marks — indigo where the teacher gave more, rose where they gave less — and an
 * amber chip is one whose transcript still needs checking against the scan.
 * Every chip selects its question in the pane beside the scan.
 */
export function MarksSummary({
  questions,
  gradingByQuestionId,
  criterionLevels,
  differenceByQuestionId,
  transcriptByQuestionId,
  selectedQuestionId,
  onSelect,
}: {
  questions: QuestionRow[];
  gradingByQuestionId: Map<number, GradingQuestion>;
  criterionLevels: CriterionLevelRow[];
  differenceByQuestionId: Map<number, SheetDifference & { current: number }>;
  transcriptByQuestionId: Record<number, TranscriptQuestion>;
  /** The question showing in the pane beside the scan. */
  selectedQuestionId: number | null;
  onSelect: (questionId: number) => void;
}) {
  const rows = questions.map((question) => ({
    question,
    grading: gradingByQuestionId.get(question.id) ?? null,
  }));
  const hasAnyGrading = rows.some((r) => r.grading);
  const total = rows.reduce((sum, r) => {
    if (!r.grading) return sum;
    return sum + (r.grading.finalPoints ?? r.grading.conservativePoints);
  }, 0);
  const maxTotal = questions.reduce((sum, q) => sum + q.max_points, 0);

  const sortedLevels = [...criterionLevels].sort((a, b) =>
    a.criterion.localeCompare(b.criterion)
  );
  const reviewCount = rows.filter(
    ({ question }) =>
      !differenceByQuestionId.has(question.id) && questionNeedsReview(transcriptByQuestionId[question.id])
  ).length;

  if (questions.length === 0) return null;

  return (
    // Pinned: these chips are how you move between questions now, so they have
    // to stay reachable while the panes below fill the screen.
    <div className="sticky top-0 z-20 mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 shadow-[0_6px_12px_-10px_rgba(28,27,24,0.5)]">
      <div className="flex flex-wrap items-center gap-y-1 text-sm">
        <span className="mr-2 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Marks
        </span>
        {rows.map(({ question, grading }, i) => {
          // The mark on record: the teacher's, else the conservative pass —
          // the same one the report, the exports and Criterion A use.
          const points = grading ? grading.finalPoints ?? grading.conservativePoints : null;
          const disagree = !!grading && grading.proposedPoints !== grading.conservativePoints;
          const difference = differenceByQuestionId.get(question.id);
          // A mark that disagrees with the teacher's own sheet outranks a shaky
          // transcript: the first is about the grade, the second about legibility.
          const review = questionNeedsReview(transcriptByQuestionId[question.id]);
          const chipTone = difference
            ? difference.sheet > difference.current
              ? "bg-indigo-100 text-indigo-900 hover:bg-indigo-200"
              : "bg-rose-100 text-rose-900 hover:bg-rose-200"
            : review
            ? "bg-amber-100 text-amber-900 hover:bg-amber-200"
            : "text-slate-700 hover:bg-slate-200";
          const selected = question.id === selectedQuestionId;
          const chipTitle = difference
            ? `Your sheet says ${difference.sheet}; the app has ${difference.current}. Click to check.`
            : review
            ? "Low-confidence or unresolved illegible steps — click to check against the scan."
            : `Show question ${question.number}`;
          return (
            <span key={question.id} className="inline-flex items-center whitespace-nowrap">
              {i > 0 && <span className="mx-1.5 text-slate-300">·</span>}
              <button
                type="button"
                onClick={() => onSelect(question.id)}
                title={chipTitle}
                aria-pressed={selected}
                className={`rounded px-1.5 py-0.5 font-medium ${chipTone} ${
                  selected ? "ring-2 ring-slate-900 ring-offset-1" : ""
                }`}
              >
                Q{question.number}
                {difference ? (
                  <>
                    <span className="ml-1">
                      {difference.current}/{question.max_points}
                    </span>
                    <span className="ml-1 font-semibold">
                      · yours {difference.sheet} {difference.sheet > difference.current ? "▲" : "▼"}
                    </span>
                  </>
                ) : (
                  <span className="ml-1 opacity-75">
                    {points ?? "—"}/{question.max_points}
                  </span>
                )}
              </button>
              {disagree && (
                <span
                  role="img"
                  aria-label={`proposed score: ${grading!.proposedPoints}`}
                  title={`the first pass proposed ${grading!.proposedPoints}`}
                  className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500"
                />
              )}
            </span>
          );
        })}
        {hasAnyGrading && (
          <span className="ml-3 shrink-0 whitespace-nowrap border-l border-slate-300 pl-3 font-semibold text-slate-800">
            Total {total}/{maxTotal}
          </span>
        )}
      </div>

      {reviewCount > 0 && (
        <p className="mt-2 text-xs text-slate-600">
          <span className="rounded bg-amber-100 px-1 font-semibold text-amber-900">
            {reviewCount} question{reviewCount === 1 ? "" : "s"} to check
          </span>{" "}
          — low-confidence or unresolved illegible steps. Click one to open it.
        </p>
      )}

      {differenceByQuestionId.size > 0 && (
        <p className="mt-2 text-xs text-slate-600">
          <span className="font-semibold">
            {differenceByQuestionId.size} mark{differenceByQuestionId.size === 1 ? "" : "s"} differ
            {differenceByQuestionId.size === 1 ? "s" : ""} from your sheet.
          </span>{" "}
          <span className="rounded bg-indigo-100 px-1 text-indigo-900">▲ you gave more</span>{" "}
          <span className="rounded bg-rose-100 px-1 text-rose-900">▼ you gave less</span> — click one
          to open it.
        </p>
      )}

      {sortedLevels.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-y-1 border-t border-slate-200 pt-2 text-sm">
          <span className="mr-2 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Levels
          </span>
          {sortedLevels.map((cl, i) => (
            <span key={cl.criterion} className="inline-flex items-center whitespace-nowrap">
              {i > 0 && <span className="mx-1.5 text-slate-300">·</span>}
              <span className="font-medium text-slate-700">{cl.criterion}</span>
              <span className="ml-1 font-semibold text-slate-800">
                {cl.level_final ?? cl.level_conservative}
              </span>
              <span
                className="ml-1 text-slate-500"
                title={
                  cl.criterion === "A"
                    ? "The AI's two passes gave different marks on some questions; each pass's level follows from its own marks. The level on record follows from the marks on record."
                    : "The AI's two passes judged this criterion differently."
                }
              >
                (AI proposed {cl.level_proposed} · conservative {cl.level_conservative})
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
