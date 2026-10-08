"use client";

import Link from "next/link";
import { useState } from "react";
import type { DpGradingQuestion, QuestionRow, ReportSections } from "@/lib/types";
import { firstNameOf, injectName, injectNameSections } from "@/lib/render/names";
import { buildMarkValueMap, pickFinal, sumQuestionMarks } from "@/lib/submissions/dp-calc";

/**
 * DP variant of OutputsPanel — same reports table / Toddle-comment pattern
 * as MYP, but the cover summary shows marks per question + grade 1-7
 * (labelled "Grade") instead of criterion levels, per spec P13/P14.
 */
export function DpOutputsPanel({
  studentName,
  classId,
  pseudonym,
  questions,
  gradingByQuestionId,
  gradeFinal,
  pct,
  sections,
}: {
  studentName: string;
  /** The student's class, whose page is where MAP and CAT4 are imported. */
  classId: number | null;
  pseudonym?: string;
  questions: QuestionRow[];
  gradingByQuestionId: Map<number, DpGradingQuestion>;
  gradeFinal: number | null;
  pct: number | null;
  sections: ReportSections;
}) {
  const [copied, setCopied] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);
  // First name only: this text is written to the student and is copied straight
  // into Toddle, so it must read the same here as in the exported document.
  const firstName = firstNameOf(studentName);
  const rendered = injectNameSections(sections, firstName, pseudonym);
  const toddleComment = injectName(sections.feedbackComment, firstName, pseudonym);
  const toddleReport = injectName(sections.toddleReport ?? "", firstName, pseudonym);

  const rows = questions.map((q) => {
    const content = gradingByQuestionId.get(q.id);
    const points = content ? sumQuestionMarks(content, q.dp_scheme, pickFinal) : null;
    return { question: q, points };
  });
  const total = rows.reduce((sum, r) => sum + (r.points ?? 0), 0);
  const maxTotal = questions.reduce((sum, q) => sum + q.max_points, 0);

  async function copyComment() {
    try {
      await navigator.clipboard.writeText(toddleComment);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — the teacher can still select the text manually.
    }
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(toddleReport);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    } catch {
      // Clipboard API unavailable — the teacher can still select the text manually.
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Toddle comment</h2>
          <button
            type="button"
            onClick={copyComment}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="mt-3 whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm text-slate-800">
          {toddleComment}
        </p>
        {gradeFinal !== null && (
          <p className="mt-3 text-sm font-medium text-slate-700">
            Grade to record in Toddle: <span className="font-semibold">{gradeFinal} / 7</span>
          </p>
        )}
      </div>

      {toddleReport.trim() && (
        <div className="rounded-lg border border-indigo-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Student report comment (Toddle)</h2>
            <button
              type="button"
              onClick={copyReport}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
            >
              {copiedReport ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Longer, student-friendly version: intro plus what went well, what to work on, and next steps.
          </p>
          <p className="mt-3 whitespace-pre-wrap rounded bg-indigo-50/60 p-3 text-sm text-slate-800">
            {toddleReport}
          </p>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-5 print:border-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Cover summary</h2>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 print:hidden"
          >
            Print
          </button>
        </div>
        <table className="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-500">
              <th className="py-1 pr-2">Question</th>
              <th className="py-1 pr-2">Marks</th>
              <th className="py-1 pr-2">Max</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ question, points }) => (
              <tr key={question.id} className="border-b border-slate-100">
                <td className="py-1 pr-2">Q{question.number}</td>
                <td className="py-1 pr-2">{points ?? "—"}</td>
                <td className="py-1 pr-2">{question.max_points}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-1 pr-2">Total</td>
              <td className="py-1 pr-2">{total}</td>
              <td className="py-1 pr-2">{maxTotal}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-sm font-medium text-slate-700">
          {pct !== null && <>{pct.toFixed(1)}% · </>}
          Grade: {gradeFinal ?? "—"} / 7
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold tracking-tight">Full report</h2>

        <section className="mt-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Data Correlation (Internal Insight)
          </h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
            {rendered.dataCorrelation ?? (
              <span className="italic text-slate-400">
                No external data (MAP/CAT4) on file for this student.
                {classId !== null && (
                  <>
                    {" "}
                    <Link href={`/classes/${classId}#import`} className="underline underline-offset-2">
                      Import it on the class page
                    </Link>
                    .
                  </>
                )}
              </span>
            )}
          </p>
        </section>

        <section className="mt-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Strengths
          </h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-800">
            {rendered.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>

        <section className="mt-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Areas for Improvement
          </h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-800">
            {rendered.areasForImprovement.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>

        <section className="mt-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Actionable Steps
          </h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-800">
            {rendered.actionableSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>

        <section className="mt-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Feedback Comment
          </h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
            {rendered.feedbackComment}
          </p>
        </section>
      </div>
    </div>
  );
}
