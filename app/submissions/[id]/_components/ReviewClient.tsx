"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { warningFix } from "@/lib/intake/warning-fix";
import { useHashJump } from "./useHashJump";
import { useRouter } from "next/navigation";
import type {
  AssessmentRow,
  CriterionLevelRow,
  DescriptorCheckRow,
  RubricDescriptorRow,
  GradingQuestion,
  GradingRow,
  QuestionRow,
  ReportRow,
  ReportSections,
  SaveStatus,
  SheetDifference,
  StudentRow,
  SubmissionRow,
  TranscriptQuestion,
  TranscriptRow,
} from "@/lib/types";
import type { SubmissionNav } from "@/lib/submissions/nav";
import { Breadcrumb } from "@/app/_components/Breadcrumb";
import { PageViewer } from "./PageViewer";
import { QuestionPanel } from "./QuestionPanel";
import { CriterionLevelPanel } from "./CriterionLevelPanel";
import { ReportEditor } from "./ReportEditor";
import { OutputsPanel } from "./OutputsPanel";
import { MarksSummary } from "./MarksSummary";
import { questionNeedsReview } from "@/lib/submissions/review-state";
import { applySheetMarksAction, keepAppMarkAction } from "@/lib/marks-import/actions";

type PipelineEndpoint = "transcribe" | "grade" | "report";

function buildCheckMap(rows: DescriptorCheckRow[]): Record<number, DescriptorCheckRow> {
  return Object.fromEntries(rows.map((c) => [c.descriptor_id, c]));
}

function buildTranscriptMap(rows: TranscriptRow[]): Record<number, TranscriptQuestion> {
  return Object.fromEntries(rows.map((t) => [t.question_id, t.content]));
}

function buildGradingMap(rows: GradingRow[]): Record<number, GradingQuestion> {
  return Object.fromEntries(rows.map((g) => [g.question_id, g.content]));
}

function buildLevelMap(rows: CriterionLevelRow[]): Record<string, CriterionLevelRow> {
  return Object.fromEntries(rows.map((cl) => [cl.criterion, cl]));
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

export function ReviewClient({
  submission,
  assessment,
  student,
  questions,
  transcripts,
  gradings,
  criterionLevels,
  rubricDescriptors,
  descriptorChecks,
  sheetDifferences,
  report,
  nav,
}: {
  submission: SubmissionRow;
  assessment: AssessmentRow;
  student: StudentRow | null;
  questions: QuestionRow[];
  transcripts: TranscriptRow[];
  gradings: GradingRow[];
  criterionLevels: CriterionLevelRow[];
  rubricDescriptors: RubricDescriptorRow[];
  descriptorChecks: DescriptorCheckRow[];
  sheetDifferences: SheetDifference[];
  report: ReportRow | null;
  nav: SubmissionNav;
}) {
  const router = useRouter();
  const studentName = student?.name ?? "the student";
  const studentPseudonym = student?.pseudonym;

  // Keyboard nav: ArrowLeft/ArrowRight cycle prev/next, but not while the
  // teacher is typing in a transcript/report field.
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
  const [gradingMap, setGradingMap] = useState<Record<number, GradingQuestion>>(() =>
    buildGradingMap(gradings)
  );
  const [levelMap, setLevelMap] = useState<Record<string, CriterionLevelRow>>(() =>
    buildLevelMap(criterionLevels)
  );
  const [sections, setSections] = useState<ReportSections | null>(report?.sections ?? null);
  const [reportStatus, setReportStatus] = useState<ReportRow["status"] | null>(
    report?.status ?? null
  );

  // Re-sync local editable state from fresh server data after router.refresh()
  // (e.g. once a pipeline run completes). Adjusting state during render from a
  // changed prop, guarded by a "previous prop" snapshot, avoids the extra
  // render pass that useEffect(setState) would cause.
  const [checkMap, setCheckMap] = useState<Record<number, DescriptorCheckRow>>(() =>
    buildCheckMap(descriptorChecks)
  );

  const [prevTranscripts, setPrevTranscripts] = useState(transcripts);
  if (prevTranscripts !== transcripts) {
    setPrevTranscripts(transcripts);
    setTranscriptMap(buildTranscriptMap(transcripts));
  }
  const [prevGradings, setPrevGradings] = useState(gradings);
  if (prevGradings !== gradings) {
    setPrevGradings(gradings);
    setGradingMap(buildGradingMap(gradings));
  }
  const [prevLevels, setPrevLevels] = useState(criterionLevels);
  if (prevLevels !== criterionLevels) {
    setPrevLevels(criterionLevels);
    setLevelMap(buildLevelMap(criterionLevels));
  }
  const [prevChecks, setPrevChecks] = useState(descriptorChecks);
  if (prevChecks !== descriptorChecks) {
    setPrevChecks(descriptorChecks);
    setCheckMap(buildCheckMap(descriptorChecks));
  }
  const [prevReport, setPrevReport] = useState(report);
  if (prevReport !== report) {
    setPrevReport(report);
    setSections(report?.sections ?? null);
    setReportStatus(report?.status ?? null);
  }

  // One question shows at a time, beside the scan. Open on the first one that
  // wants checking, since that is what the screen is for.
  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(() => {
    const needing = questions.find((q) => questionNeedsReview(transcripts.find((t) => t.question_id === q.id)?.content));
    return needing?.id ?? questions[0]?.id ?? null;
  });

  useHashJump();

  // MarksImport links in with #q-<id> from the assessment page.
  useEffect(() => {
    const match = /^#q-(\d+)$/.exec(window.location.hash);
    if (!match) return;
    const id = Number(match[1]);
    if (questions.some((q) => q.id === id)) setSelectedQuestionId(id);
  }, [questions]);

  const selectedIndex = questions.findIndex((q) => q.id === selectedQuestionId);
  function step(delta: number) {
    const next = questions[selectedIndex + delta];
    if (next) setSelectedQuestionId(next.id);
  }

  const [savingTranscript, setSavingTranscript] = useState<Record<number, boolean>>({});
  const [savingGrading, setSavingGrading] = useState<Record<number, boolean>>({});
  const [savingLevel, setSavingLevel] = useState<Record<string, boolean>>({});
  const [savingReport, setSavingReport] = useState(false);
  const [approving, setApproving] = useState(false);

  const [transcriptStatus, setTranscriptStatus] = useState<Record<number, SaveStatus | undefined>>(
    {}
  );
  const [gradingStatus, setGradingStatus] = useState<Record<number, SaveStatus | undefined>>({});
  const [levelStatus, setLevelStatus] = useState<Record<string, SaveStatus | undefined>>({});

  const [running, setRunning] = useState<PipelineEndpoint | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [gradeUnresolved, setGradeUnresolved] = useState<string[] | null>(null);

  function flashSuccess<K extends number | string>(
    key: K,
    setStatus: (updater: (s: Record<K, SaveStatus | undefined>) => Record<K, SaveStatus | undefined>) => void
  ) {
    setStatus((s) => ({ ...s, [key]: { kind: "success" } }));
    setTimeout(() => {
      setStatus((s) => (s[key]?.kind === "success" ? { ...s, [key]: undefined } : s));
    }, 2000);
  }

  async function saveTranscript(questionId: number) {
    const raw = transcriptMap[questionId];
    if (!raw) return;
    // Saving the question means "I've reviewed these steps": auto-resolve any illegible
    // flag still pending, using the current step text. A step that is still blank or
    // holds a "[?]" placeholder is treated as unreadable (no credit) rather than guessed.
    const content = {
      ...raw,
      illegible: raw.illegible.map((f) => {
        if (f.resolvedText !== undefined) return f;
        const stepText = raw.steps[f.stepIndex]?.text ?? "";
        const usable = stepText.trim() !== "" && !stepText.includes("[?]");
        return { ...f, resolvedText: usable ? stepText : "" };
      }),
    };
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
        // Reflect exactly what the server persisted — never leave the field
        // showing something other than the saved value.
        setTranscriptMap((m) => ({ ...m, [questionId]: json.transcript.content }));
        flashSuccess(questionId, setTranscriptStatus);
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

  // Marks on the teacher's uploaded sheet that disagree with the app's, by question.
  const differenceByQuestionId = new Map(
    sheetDifferences
      .filter((d): d is SheetDifference & { current: number } => d.current !== null)
      .map((d) => [d.questionId, d])
  );
  const [settling, setSettling] = useState<Record<number, boolean>>({});

  /** Settle a sheet difference: take the teacher's mark, or keep the app's. */
  async function settleDifference(questionId: number, choice: "mine" | "app") {
    setSettling((s) => ({ ...s, [questionId]: true }));
    try {
      if (choice === "mine") {
        await applySheetMarksAction(assessment.id, [{ submissionId: submission.id, questionId }]);
      } else {
        await keepAppMarkAction(submission.id, questionId);
      }
      router.refresh();
    } finally {
      setSettling((s) => ({ ...s, [questionId]: false }));
    }
  }

  async function saveGrading(questionId: number) {
    const content = gradingMap[questionId];
    if (!content) return;
    setSavingGrading((s) => ({ ...s, [questionId]: true }));
    setGradingStatus((s) => ({ ...s, [questionId]: undefined }));
    try {
      const res = await fetch("/api/review/grading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: submission.id, questionId, content }),
      });
      if (res.ok) {
        const json = await res.json();
        setGradingMap((m) => ({ ...m, [questionId]: json.grading.content }));
        if (json.criterionLevel) {
          setLevelMap((m) => ({ ...m, A: json.criterionLevel as CriterionLevelRow }));
        }
        flashSuccess(questionId, setGradingStatus);
        // A saved mark may now agree with the teacher's sheet, settling a difference.
        if (differenceByQuestionId.has(questionId)) router.refresh();
      } else {
        const json = await res.json().catch(() => null);
        setGradingStatus((s) => ({
          ...s,
          [questionId]: {
            kind: "error",
            message: (json && (json.error as string)) ?? `Save failed (${res.status}).`,
          },
        }));
      }
    } catch {
      setGradingStatus((s) => ({
        ...s,
        [questionId]: { kind: "error", message: "Network error — could not reach the server." },
      }));
    } finally {
      setSavingGrading((s) => ({ ...s, [questionId]: false }));
    }
  }

  async function acceptAllGrading() {
    const res = await fetch("/api/review/grading/accept-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId: submission.id }),
    });
    if (res.ok) {
      const json = await res.json();
      const rows = json.gradings as GradingRow[];
      setGradingMap(Object.fromEntries(rows.map((g) => [g.question_id, g.content])));
      if (json.criterionLevel) {
        setLevelMap((m) => ({ ...m, A: json.criterionLevel as CriterionLevelRow }));
      }
    }
  }

  /**
   * The teacher's own tick on a rubric descriptor. Applied locally first so the
   * checkbox answers immediately, then confirmed by whatever the server returns;
   * a failure puts the row back as it was and reports under that criterion.
   * The level is deliberately untouched — ticks inform the best fit, not decide it.
   */
  async function toggleDescriptor(criterion: string, descriptorId: number, met: boolean) {
    const before = checkMap[descriptorId];
    setCheckMap((m) => {
      // A descriptor the grader never judged has no row yet; the server creates one,
      // but the checkbox should answer now rather than after the round trip.
      const base: DescriptorCheckRow = m[descriptorId] ?? {
        id: 0,
        submission_id: submission.id,
        descriptor_id: descriptorId,
        met_proposed: null,
        met_final: null,
        evidence: "",
        text_at_check: "",
        created_at: "",
      };
      return { ...m, [descriptorId]: { ...base, met_final: met ? 1 : 0 } };
    });
    setLevelStatus((s) => ({ ...s, [criterion]: undefined }));
    try {
      const res = await fetch("/api/review/descriptor-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: submission.id,
          checks: [{ descriptorId, met }],
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `Save failed (${res.status}).`);
      const rows = (json.checks ?? []) as DescriptorCheckRow[];
      setCheckMap((m) => ({
        ...m,
        ...Object.fromEntries(rows.map((c) => [c.descriptor_id, c])),
      }));
      flashSuccess(criterion, setLevelStatus);
    } catch (err) {
      setCheckMap((m) => {
        const next = { ...m };
        if (before) next[descriptorId] = before;
        else delete next[descriptorId];
        return next;
      });
      setLevelStatus((s) => ({
        ...s,
        [criterion]: { kind: "error", message: (err as Error).message },
      }));
    }
  }

  async function saveLevel(criterion: string) {
    const row = levelMap[criterion];
    if (!row) return;
    setSavingLevel((s) => ({ ...s, [criterion]: true }));
    setLevelStatus((s) => ({ ...s, [criterion]: undefined }));
    try {
      const res = await fetch("/api/review/criterion-level", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: submission.id,
          criterion,
          levelFinal: row.level_final ?? row.level_conservative,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setLevelMap((m) => ({ ...m, [criterion]: json.criterionLevel }));
        flashSuccess(criterion, setLevelStatus);
      } else {
        const json = await res.json().catch(() => null);
        setLevelStatus((s) => ({
          ...s,
          [criterion]: {
            kind: "error",
            message: (json && (json.error as string)) ?? `Save failed (${res.status}).`,
          },
        }));
      }
    } catch {
      setLevelStatus((s) => ({
        ...s,
        [criterion]: { kind: "error", message: "Network error — could not reach the server." },
      }));
    } finally {
      setSavingLevel((s) => ({ ...s, [criterion]: false }));
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
      const res = await fetch(`/api/pipeline/${endpoint}`, {
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
            {student && (
              <>
                {" · "}
                <a
                  href={`/students/${student.id}/dossier`}
                  className="underline hover:text-slate-900"
                >
                  View dossier
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
        {gradings.length > 0 && (
          <button
            type="button"
            onClick={acceptAllGrading}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
          >
            Accept all proposed points
          </button>
        )}
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

      <MarksSummary
        questions={questions}
        gradingByQuestionId={gradingByQuestionId}
        criterionLevels={Object.values(levelMap)}
        differenceByQuestionId={differenceByQuestionId}
        transcriptByQuestionId={transcriptMap}
        selectedQuestionId={selectedQuestionId}
        onSelect={setSelectedQuestionId}
      />

      {/* The working area: the scan on the left, one question on the right, each
          scrolling inside itself so neither column ever runs past the other.
          9rem is the room the pinned marks strip above needs — unlike the
          constant this replaced, being a little out only makes the panes
          slightly taller or shorter, it cannot put the columns out of step. */}
      <div className="grid grid-cols-1 gap-6 lg:h-[calc(100vh-9rem)] lg:min-h-[34rem] lg:grid-cols-2">
        <div className="flex min-h-0 flex-col">
          <h2 className="mb-2 shrink-0 text-lg font-semibold tracking-tight">The paper</h2>
          <PageViewer
            submissionId={submission.id}
            pageCount={submission.page_count}
            scratchPages={submission.scratch_pages}
          />
        </div>

        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              {selectedIndex >= 0
                ? `Question ${questions[selectedIndex].number}`
                : "Questions"}
              {selectedIndex >= 0 && (
                <span className="ml-2 text-sm font-normal text-slate-500">
                  {selectedIndex + 1} of {questions.length}
                </span>
              )}
            </h2>
            {questions.length > 1 && (
              <span className="flex gap-1">
                <button
                  type="button"
                  onClick={() => step(-1)}
                  disabled={selectedIndex <= 0}
                  className="rounded border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-100 disabled:opacity-40"
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  disabled={selectedIndex < 0 || selectedIndex >= questions.length - 1}
                  className="rounded border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-100 disabled:opacity-40"
                >
                  Next →
                </button>
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
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
                {questions.filter((q) => q.id === selectedQuestionId).map((q) => (
                  <QuestionPanel
                    key={q.id}
                    question={q}
                    transcript={transcriptMap[q.id] ?? null}
                    grading={gradingMap[q.id] ?? null}
                    difference={differenceByQuestionId.get(q.id) ?? null}
                    settling={!!settling[q.id]}
                    onSettleDifference={(choice) => settleDifference(q.id, choice)}
                    savingTranscript={!!savingTranscript[q.id]}
                    savingGrading={!!savingGrading[q.id]}
                    transcriptStatus={transcriptStatus[q.id]}
                    gradingStatus={gradingStatus[q.id]}
                    onStepTextChange={(stepIndex, text) =>
                      setTranscriptMap((m) => {
                        const current = m[q.id];
                        if (!current) return m;
                        const steps = current.steps.map((s, i) =>
                          i === stepIndex ? { ...s, text } : s
                        );
                        // Editing an amber step also resolves any illegible flag on that
                        // step — the corrected step text IS the resolution, so it never
                        // has to be retyped in the red box. (Untouched if marked unreadable.)
                        // Clearing it to nothing is NOT a resolution: emptying a line is
                        // how she says it does not belong, which is what the button beside
                        // it is for, so the flag is left alone rather than being saved as
                        // "unreadable".
                        const illegible =
                          text.trim() === ""
                            ? current.illegible
                            : current.illegible.map((f) =>
                                f.stepIndex === stepIndex && f.resolvedText !== ""
                                  ? { ...f, resolvedText: text }
                                  : f
                              );
                        return { ...m, [q.id]: { ...current, steps, illegible } };
                      })
                    }
                    onToggleStepOmitted={(stepIndex) =>
                      setTranscriptMap((m) => {
                        const current = m[q.id];
                        if (!current) return m;
                        const steps = current.steps.map((s, i) =>
                          i === stepIndex ? { ...s, omitted: !s.omitted } : s
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
                    onFinalPointsChange={(points) =>
                      setGradingMap((m) => {
                        const current = m[q.id];
                        if (!current) return m;
                        return { ...m, [q.id]: { ...current, finalPoints: points } };
                      })
                    }
                    onSaveGrading={() => saveGrading(q.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Below the split: a judgement about the whole paper, not about the
          question currently on screen, and the descriptor list wants the width. */}
      <div className="mt-8">
            <h2 className="mb-3 text-lg font-semibold tracking-tight">Criterion levels</h2>
            <CriterionLevelPanel
              levels={Object.values(levelMap)}
              descriptors={rubricDescriptors}
              checkByDescriptorId={checkMap}
              onToggleDescriptor={toggleDescriptor}
              saving={savingLevel}
              statuses={levelStatus}
              onLevelFinalChange={(criterion, value) =>
                setLevelMap((m) => ({
                  ...m,
                  [criterion]: { ...m[criterion], level_final: value },
                }))
              }
              onSave={saveLevel}
            />
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
          <OutputsPanel
            studentName={studentName}
            classId={student?.class_id ?? null}
            pseudonym={studentPseudonym}
            questions={questions}
            gradingByQuestionId={gradingByQuestionId}
            criterionLevels={Object.values(levelMap)}
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
