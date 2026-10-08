"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { warningFix } from "@/lib/intake/warning-fix";
import { useHashJump } from "./useHashJump";
import { useRouter } from "next/navigation";
import type {
  AssessmentRow,
  DpGradingQuestion,
  DpResultRow,
  QuestionRow,
  ReportRow,
  ReportSections,
  SaveStatus,
  StudentRow,
  SubmissionRow,
  TranscriptQuestion,
  TranscriptRow,
} from "@/lib/types";
import type { SubmissionNav } from "@/lib/submissions/nav";
import type { DpGradingRow } from "@/lib/submissions/dp-grading";
import { Breadcrumb } from "@/app/_components/Breadcrumb";
import { PageViewer } from "./PageViewer";
import { DpQuestionPanel } from "./DpQuestionPanel";
import { DpMarksSummary } from "./DpMarksSummary";
import { DpOutputsPanel } from "./DpOutputsPanel";
import { ReportEditor } from "./ReportEditor";

type PipelineEndpoint = "transcribe" | "grade" | "report";

function buildTranscriptMap(rows: TranscriptRow[]): Record<number, TranscriptQuestion> {
  return Object.fromEntries(rows.map((t) => [t.question_id, t.content]));
}

function buildDpGradingMap(rows: DpGradingRow[]): Record<number, DpGradingQuestion> {
  return Object.fromEntries(rows.map((g) => [g.question_id, g.content]));
}

function formatUnresolved(json: unknown): string[] {
  const obj = json as Record<string, unknown> | null;
  const list = Array.isArray(json)
    ? json
    : (obj?.unresolved as unknown[] | undefined) ??
      (obj?.flags as unknown[] | undefined) ??
      (obj?.errors as unknown[] | undefined) ??
      [];

  if (!Array.isArray(list) || list.length === 0) {
    const message = typeof obj?.error === "string" ? obj.error : undefined;
    return [message ?? "Grading is blocked by unresolved illegible flags."];
  }

  return list.map((item) => {
    if (typeof item === "string") return item;
    const rec = item as Record<string, unknown>;
    const q = rec.questionNumber ?? rec.question ?? rec.questionId ?? "?";
    const note = rec.note ?? rec.message ?? JSON.stringify(item);
    return `Q${q}: ${note}`;
  });
}

/**
 * DP (IBDP) variant of ReviewClient — same visual/navigation pattern
 * (independent scrolling columns, prev/next, breadcrumbs, keyboard
 * shortcuts, "Saved ✓" status) but the right column shows mark-a-mark
 * toggles against the official markscheme instead of MYP level bands, and
 * the summary strip shows percentage + grade 1-7 instead of criterion
 * levels (spec P11/P12).
 */
export function DpReviewClient({
  submission,
  assessment,
  student,
  questions,
  transcripts,
  dpGradings,
  dpResult,
  report,
  nav,
}: {
  submission: SubmissionRow;
  assessment: AssessmentRow;
  student: StudentRow | null;
  questions: QuestionRow[];
  transcripts: TranscriptRow[];
  dpGradings: DpGradingRow[];
  dpResult: DpResultRow | null;
  report: ReportRow | null;
  nav: SubmissionNav;
}) {
  const router = useRouter();
  const studentName = student?.name ?? "the student";
  const studentPseudonym = student?.pseudonym;
  const boundaries = assessment.boundaries ?? [];

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable = tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
      if (isEditable) return;
      if (e.key === "ArrowLeft" && nav.prevId) {
        router.push(`/submissions/${nav.prevId}`);
      } else if (e.key === "ArrowRight" && nav.nextId) {
        router.push(`/submissions/${nav.nextId}`);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [nav.prevId, nav.nextId, router]);

  const [transcriptMap, setTranscriptMap] = useState<Record<number, TranscriptQuestion>>(() =>
    buildTranscriptMap(transcripts)
  );
  const [gradingMap, setGradingMap] = useState<Record<number, DpGradingQuestion>>(() =>
    buildDpGradingMap(dpGradings)
  );
  const [result, setResult] = useState<DpResultRow | null>(dpResult);
  useHashJump();
  const [sections, setSections] = useState<ReportSections | null>(report?.sections ?? null);
  const [reportStatus, setReportStatus] = useState<ReportRow["status"] | null>(
    report?.status ?? null
  );

  const [prevTranscripts, setPrevTranscripts] = useState(transcripts);
  if (prevTranscripts !== transcripts) {
    setPrevTranscripts(transcripts);
    setTranscriptMap(buildTranscriptMap(transcripts));
  }
  const [prevGradings, setPrevGradings] = useState(dpGradings);
  if (prevGradings !== dpGradings) {
    setPrevGradings(dpGradings);
    setGradingMap(buildDpGradingMap(dpGradings));
  }
  const [prevResult, setPrevResult] = useState(dpResult);
  if (prevResult !== dpResult) {
    setPrevResult(dpResult);
    setResult(dpResult);
  }
  const [prevReport, setPrevReport] = useState(report);
  if (prevReport !== report) {
    setPrevReport(report);
    setSections(report?.sections ?? null);
    setReportStatus(report?.status ?? null);
  }

  const [savingTranscript, setSavingTranscript] = useState<Record<number, boolean>>({});
  const [transcriptStatus, setTranscriptStatus] = useState<Record<number, SaveStatus | undefined>>(
    {}
  );

  const [savingMark, setSavingMark] = useState<{ questionId: number; markId: string } | null>(null);
  const [markStatusByQuestion, setMarkStatusByQuestion] = useState<
    Record<number, Record<string, SaveStatus | undefined>>
  >({});

  const [savingReport, setSavingReport] = useState(false);
  const [approving, setApproving] = useState(false);

  const [running, setRunning] = useState<PipelineEndpoint | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [gradeUnresolved, setGradeUnresolved] = useState<string[] | null>(null);

  function flashMarkSuccess(questionId: number, markId: string) {
    setMarkStatusByQuestion((s) => ({
      ...s,
      [questionId]: { ...s[questionId], [markId]: { kind: "success" } },
    }));
    setTimeout(() => {
      setMarkStatusByQuestion((s) => {
        const current = s[questionId]?.[markId];
        if (current?.kind !== "success") return s;
        return { ...s, [questionId]: { ...s[questionId], [markId]: undefined } };
      });
    }, 2000);
  }

  async function saveTranscript(questionId: number) {
    const content = transcriptMap[questionId];
    if (!content) return;
    setSavingTranscript((s) => ({ ...s, [questionId]: true }));
    setTranscriptStatus((s) => ({ ...s, [questionId]: undefined }));
    try {
      const res = await fetch("/api/review/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: submission.id, questionId, content }),
      });
      if (res.ok) {
        const json = await res.json();
        setTranscriptMap((m) => ({ ...m, [questionId]: json.transcript.content }));
        setTranscriptStatus((s) => ({ ...s, [questionId]: { kind: "success" } }));
        setTimeout(() => {
          setTranscriptStatus((s) =>
            s[questionId]?.kind === "success" ? { ...s, [questionId]: undefined } : s
          );
        }, 2000);
      } else {
        const json = await res.json().catch(() => null);
        setTranscriptStatus((s) => ({
          ...s,
          [questionId]: {
            kind: "error",
            message: (json && (json.error as string)) ?? `Save failed (${res.status}).`,
          },
        }));
      }
    } catch {
      setTranscriptStatus((s) => ({
        ...s,
        [questionId]: { kind: "error", message: "Network error — could not reach the server." },
      }));
    } finally {
      setSavingTranscript((s) => ({ ...s, [questionId]: false }));
    }
  }

  async function toggleMark(questionId: number, markId: string, nextAwarded: boolean) {
    setSavingMark({ questionId, markId });
    setMarkStatusByQuestion((s) => ({
      ...s,
      [questionId]: { ...s[questionId], [markId]: undefined },
    }));
    try {
      const res = await fetch("/api/review/dp-marks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: submission.id, questionId, markId, finalAwarded: nextAwarded }),
      });
      if (res.ok) {
        const json = await res.json();
        setGradingMap((m) => ({ ...m, [questionId]: json.grading.content }));
        setResult(json.dpResult);
        flashMarkSuccess(questionId, markId);
      } else {
        const json = await res.json().catch(() => null);
        setMarkStatusByQuestion((s) => ({
          ...s,
          [questionId]: {
            ...s[questionId],
            [markId]: {
              kind: "error",
              message: (json && (json.error as string)) ?? `Save failed (${res.status}).`,
            },
          },
        }));
      }
    } catch {
      setMarkStatusByQuestion((s) => ({
        ...s,
        [questionId]: {
          ...s[questionId],
          [markId]: { kind: "error", message: "Network error — could not reach the server." },
        },
      }));
    } finally {
      setSavingMark(null);
    }
  }

  async function saveReport() {
    if (!sections) return;
    setSavingReport(true);
    try {
      const res = await fetch("/api/review/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: submission.id, sections }),
      });
      if (res.ok) {
        const json = await res.json();
        setSections(json.report.sections);
        setReportStatus(json.report.status);
      }
    } finally {
      setSavingReport(false);
    }
  }

  async function approveReport() {
    setApproving(true);
    try {
      const res = await fetch("/api/review/report/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send the live edits so Approve persists exactly what's on screen.
        body: JSON.stringify({ submissionId: submission.id, sections }),
      });
      if (res.ok) {
        const json = await res.json();
        setSections(json.report.sections);
        setReportStatus(json.report.status);
        router.refresh();
      }
    } finally {
      setApproving(false);
    }
  }

  async function runPipeline(endpoint: PipelineEndpoint) {
    setRunning(endpoint);
    setPipelineError(null);
    if (endpoint === "grade") setGradeUnresolved(null);
    try {
      // DP submissions must use the DP grader (mark-by-mark), never the MYP one.
      const path = endpoint === "grade" ? "grade-dp" : endpoint;
      const res = await fetch(`/api/pipeline/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: submission.id }),
      });
      if (res.status === 409) {
        const json = await res.json().catch(() => null);
        setGradeUnresolved(formatUnresolved(json));
        return;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setPipelineError(
          (json && (json.error as string)) ?? `Failed to run ${endpoint} (${res.status}).`
        );
        return;
      }
      router.refresh();
    } catch {
      setPipelineError(`Could not reach the ${endpoint} pipeline endpoint.`);
    } finally {
      setRunning(null);
    }
  }

  const gradingByQuestionId = new Map(Object.entries(gradingMap).map(([k, v]) => [Number(k), v]));

  return (
    <div>
      <Breadcrumb
        items={[
          { label: assessment.title, href: `/assessments/${assessment.id}` },
          { label: "Submissions", href: `/assessments/${assessment.id}/submissions` },
          { label: student ? student.name : "Unassigned submission" },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-3">
          <NavLink href={nav.prevId ? `/submissions/${nav.prevId}` : undefined}>← Previous</NavLink>
          {nav.position && nav.total > 0 && (
            <span className="text-sm text-slate-500">
              {nav.position} of {nav.total}
            </span>
          )}
          <NavLink href={nav.nextId ? `/submissions/${nav.nextId}` : undefined}>Next →</NavLink>
          <span className="hidden text-xs text-slate-400 sm:inline">← → to navigate</span>
        </div>
        {nav.nextNeedingReviewId ? (
          <Link
            href={`/submissions/${nav.nextNeedingReviewId}`}
            className="rounded-md bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-200"
          >
            Next needing review →
          </Link>
        ) : (
          <span className="text-sm text-slate-400">All reviewed ✓</span>
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {assessment.title} — {student ? student.name : "Unassigned submission"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Status: <span className="font-medium text-slate-700">{submission.status}</span>
            {" · "}
            <span className="font-medium text-slate-700">
              {assessment.assessment_type === "quiz" ? "Quiz" : "Unit test"}
            </span>
            {student && (
              <>
                {" · "}
                <a
                  href={`/students/${student.id}`}
                  className="underline hover:text-slate-900"
                >
                  View student
                </a>
              </>
            )}
          </p>
          {!student && (
            <p className="mt-1 text-sm text-amber-700">
              No student assigned — outputs will show a placeholder name until one is{" "}
              <Link
                href={`/assessments/${assessment.id}/submissions#assignment`}
                className="font-medium underline underline-offset-2"
              >
                assigned on the submissions page
              </Link>
              .
            </p>
          )}
          {submission.warnings && submission.warnings.length > 0 && (
            <ul className="mt-2 space-y-1">
              {submission.warnings.map((w, i) => {
                // A warning settled on this paper needs no link; one settled in
                // the assessment's setup does.
                const fix = warningFix(w, assessment.id, submission.id);
                return (
                  <li
                    key={i}
                    className="rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800"
                  >
                    {w}
                    {!fix.onPaper && (
                      <>
                        {" "}
                        <Link href={fix.href} className="underline underline-offset-2">
                          {fix.label}
                        </Link>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {report && (
          <a
            href={`/api/export/submission/${submission.id}/report`}
            className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100"
          >
            Download this report
          </a>
        )}
        {student && (
          <a
            href={`/api/export/dossier/${student.id}`}
            className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100"
          >
            Download dossier
          </a>
        )}
        <a
          href={`/assessments/${assessment.id}/submissions`}
          className="shrink-0 text-sm text-slate-600 underline hover:text-slate-900"
        >
          Class exports →
        </a>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <button
          type="button"
          onClick={() => runPipeline("transcribe")}
          disabled={running !== null}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {running === "transcribe" ? "Transcribing…" : "Run transcription"}
        </button>
        <button
          type="button"
          onClick={() => runPipeline("grade")}
          disabled={running !== null}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {running === "grade" ? "Grading…" : "Run grading"}
        </button>
        <button
          type="button"
          onClick={() => runPipeline("report")}
          disabled={running !== null}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {running === "report" ? "Generating…" : "Generate report"}
        </button>
      </div>

      {pipelineError && (
        <div className="mb-6 rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
          {pipelineError}
        </div>
      )}

      {gradeUnresolved && (
        <div className="mb-6 rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
          <p className="font-semibold">Grading blocked — unresolved illegible flags:</p>
          <ul className="mt-1 list-disc pl-5">
            {gradeUnresolved.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <DpMarksSummary
        questions={questions}
        gradingByQuestionId={gradingByQuestionId}
        boundaries={boundaries}
      />

      {/* Independently-scrolling columns on large screens, same as MYP. */}
      <div className="grid grid-cols-1 gap-6 lg:flex lg:h-[calc(100vh-21rem)] lg:flex-row lg:gap-6">
        <div className="lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Pages</h2>
          <PageViewer
            submissionId={submission.id}
            pageCount={submission.page_count}
            scratchPages={submission.scratch_pages}
          />
        </div>

        <div className="space-y-6 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <div>
            <h2 className="mb-3 text-lg font-semibold tracking-tight">Questions</h2>
            {questions.length === 0 ? (
              <p className="rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                No questions defined for this assessment yet —{" "}
                <Link href={`/assessments/${assessment.id}/setup`} className="underline underline-offset-2">
                  define them in Setup
                </Link>
                .
              </p>
            ) : (
              <div className="space-y-4">
                {questions.map((q) => (
                  <DpQuestionPanel
                    key={q.id}
                    question={q}
                    transcript={transcriptMap[q.id] ?? null}
                    grading={gradingMap[q.id] ?? null}
                    savingTranscript={!!savingTranscript[q.id]}
                    transcriptStatus={transcriptStatus[q.id]}
                    onStepTextChange={(stepIndex, text) =>
                      setTranscriptMap((m) => {
                        const current = m[q.id];
                        if (!current) return m;
                        const steps = current.steps.map((s, i) =>
                          i === stepIndex ? { ...s, text } : s
                        );
                        return { ...m, [q.id]: { ...current, steps } };
                      })
                    }
                    onIllegibleResolvedTextChange={(flagIndex, text) =>
                      setTranscriptMap((m) => {
                        const current = m[q.id];
                        if (!current) return m;
                        const illegible = current.illegible.map((f, i) =>
                          i === flagIndex ? { ...f, resolvedText: text } : f
                        );
                        return { ...m, [q.id]: { ...current, illegible } };
                      })
                    }
                    onMarkUnreadable={(flagIndex) =>
                      setTranscriptMap((m) => {
                        const current = m[q.id];
                        if (!current) return m;
                        const illegible = current.illegible.map((f, i) =>
                          i === flagIndex ? { ...f, resolvedText: "" } : f
                        );
                        return { ...m, [q.id]: { ...current, illegible } };
                      })
                    }
                    onSaveTranscript={() => saveTranscript(q.id)}
                    onToggleMark={(markId, nextAwarded) => toggleMark(q.id, markId, nextAwarded)}
                    savingMarkId={savingMark?.questionId === q.id ? savingMark.markId : null}
                    markStatus={markStatusByQuestion[q.id] ?? {}}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6">
        {sections ? (
          <ReportEditor
            sections={sections}
            onChange={setSections}
            onSave={saveReport}
            saving={savingReport}
            onApprove={approveReport}
            approving={approving}
            status={reportStatus}
          />
        ) : (
          <p className="rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
            {'No report yet. Run "Generate report" once transcription and grading are done.'}
          </p>
        )}
      </div>

      {reportStatus === "approved" && sections && (
        <div className="mt-6">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Outputs</h2>
          <DpOutputsPanel
            studentName={studentName}
            classId={student?.class_id ?? null}
            pseudonym={studentPseudonym}
            questions={questions}
            gradingByQuestionId={gradingByQuestionId}
            gradeFinal={result?.grade_final ?? result?.grade ?? null}
            pct={result?.pct ?? null}
            sections={sections}
          />
        </div>
      )}
    </div>
  );
}

/** Prev/Next nav control — plain disabled-looking text at either end of the roster (no wrap-around). */
function NavLink({ href, children }: { href?: string | null; children: React.ReactNode }) {
  if (!href) {
    return (
      <span className="cursor-not-allowed rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-300">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
    >
      {children}
    </Link>
  );
}
