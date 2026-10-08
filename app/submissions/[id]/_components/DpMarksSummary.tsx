"use client";

import type { DpGradingQuestion, GradeBoundary, QuestionRow } from "@/lib/types";
import { buildMarkValueMap, liveSubmissionStats, pickFinal, pickProposed, sumQuestionMarks } from "@/lib/submissions/dp-calc";

/**
 * Top strip for the DP review screen (spec P11): one chip per question with
 * final/max marks, then the overall total, percentage and grade 1-7 — all
 * recalculated live from whatever is in `gradingByQuestionId` on every
 * render, so a mark toggle updates this instantly with no round trip. The
 * conservative total is shown as a small, deliberately de-emphasized
 * reference next to it.
 */
export function DpMarksSummary({
  questions,
  gradingByQuestionId,
  boundaries,
}: {
  questions: QuestionRow[];
  gradingByQuestionId: Map<number, DpGradingQuestion>;
  boundaries: GradeBoundary[];
}) {
  if (questions.length === 0) return null;

  const stats = liveSubmissionStats(questions, gradingByQuestionId, boundaries);
  const hasAnyGrading = questions.some((q) => gradingByQuestionId.has(q.id));

  return (
    <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-y-1 text-sm">
        <span className="mr-2 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Marks
        </span>
        {questions.map((question, i) => {
          const content = gradingByQuestionId.get(question.id) ?? null;
          const finalPoints = content ? sumQuestionMarks(content, question.dp_scheme, pickFinal) : null;
          const proposedPoints = content ? sumQuestionMarks(content, question.dp_scheme, pickProposed) : null;
          const disagree = content !== null && finalPoints !== proposedPoints;
          return (
            <span key={question.id} className="inline-flex items-center whitespace-nowrap">
              {i > 0 && <span className="mx-1.5 text-slate-300">·</span>}
              <span className="font-medium text-slate-700">Q{question.number}</span>
              <span className="ml-1 text-slate-600">
                {finalPoints ?? "—"}/{question.max_points}
              </span>
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

      {hasAnyGrading && stats.conservativeTotal !== stats.total && (
        <p className="mt-1.5 text-xs text-slate-400">
          Conservative total (reference): {stats.conservativeTotal}/{stats.max}
        </p>
      )}
    </div>
  );
}
