import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAssessment,
  getQuestionDataFootprint,
  listLearningTargets,
  getDescriptorFootprint,
  listLevelThresholds,
  listRubricDescriptors,
  listQuestions,
  listRubrics,
  listSubmissions,
  listWorkedSolutions,
} from "@/lib/db/queries";
import { computeCompleteness } from "@/lib/assessment/completeness";
import { LEVEL_BANDS, usesLevelThresholds } from "@/lib/assessment/bands";
import {
  addQuestion,
  deleteQuestionAction,
  moveQuestion,
  saveQuestionWorkedSolution,
  saveRubric,
  saveRubricDescriptorsAction,
  saveWholeWorkedSolution,
  updateQuestionAction,
} from "@/lib/assessment/actions";
import { Breadcrumb } from "@/app/_components/Breadcrumb";
import { NameMaskEditor } from "./_components/NameMaskEditor";
import { LearningTargetCombobox } from "./_components/LearningTargetCombobox";
import { PaperAutofill } from "./_components/PaperAutofill";
import { WorkedSolutionUpload } from "./_components/WorkedSolutionUpload";
import { ThresholdsForm } from "./_components/ThresholdsForm";
import { ProposeKey } from "./_components/ProposeKey";
import { isFmTest } from "@/lib/assessment/course";
import { DpSetup } from "./_components/DpSetup";
import { RemoveQuestionButton } from "./_components/RemoveQuestionButton";
import { RubricDescriptorEditor } from "./_components/RubricDescriptorEditor";
import { ProposeDescriptors } from "./_components/ProposeDescriptors";
import { paperPreviewPageCount } from "@/lib/assessment/paper-preview";

export default async function AssessmentSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const assessmentId = Number(id);
  const assessment = getAssessment(assessmentId);
  if (!assessment) notFound();

  // DP assessments render an entirely separate setup flow (paper/markscheme upload, markscheme
  // parse editor, learning targets, grade boundaries) — the MYP markup below is untouched.
  if (assessment.programme === "DP") {
    return (
      <div>
        <Breadcrumb
          items={[
            { label: "Assessments", href: "/assessments" },
            { label: assessment.title, href: `/assessments/${assessmentId}` },
            { label: "Setup" },
          ]}
        />
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Setup — {assessment.title}</h1>
          <Link
            href={`/assessments/${assessmentId}`}
            className="text-sm text-slate-600 hover:underline"
          >
            Back to assessment
          </Link>
        </div>
        <DpSetup assessment={assessment} />
      </div>
    );
  }

  const questions = listQuestions(assessmentId);
  const thresholds = listLevelThresholds(assessmentId);
  const workedSolutions = listWorkedSolutions(assessmentId);
  const rubrics = listRubrics(assessmentId);
  const descriptors = listRubricDescriptors(assessmentId);
  // What a removed descriptor would take with it, so the editor can say so before it goes.
  const descriptorFootprints = Object.fromEntries(
    descriptors.map((d) => [d.id, getDescriptorFootprint(d.id)])
  );
  const learningTargets = listLearningTargets(assessment.grade);
  const completeness = computeCompleteness(assessmentId);

  const wholeSolution = workedSolutions.find((ws) => ws.question_id === null);
  const perQuestionSolutions = new Map(
    workedSolutions
      .filter((ws) => ws.question_id !== null)
      .map((ws) => [ws.question_id as number, ws])
  );
  const targetsById = new Map(learningTargets.map((t) => [t.id, t]));
  // Every criterion judged against descriptors rather than arithmetic. C belongs here:
  // the grader already reads a Criterion C rubric, but there was nowhere to write one.
  const rubricCriteria = assessment.criteria.filter((c) => c === "B" || c === "C" || c === "D");
  const fmTest = isFmTest(assessment);
  // The level band sorts a question into a Criterion A threshold band, so it is
  // only asked for when the assessment has Criterion A. Without it (and without
  // the Financial Math variant picker) the question row loses a column.
  const showBand = usesLevelThresholds(assessment);
  const questionRowCols =
    fmTest || showBand
      ? "sm:grid-cols-[90px_100px_110px_1fr_auto]"
      : "sm:grid-cols-[90px_100px_1fr_auto]";
  const totalPoints = questions
    .filter((q) => q.variant !== "modified")
    .reduce((sum, q) => sum + q.max_points, 0);
  const modifiedTotal = questions
    .filter((q) => q.variant !== "standard")
    .reduce((sum, q) => sum + q.max_points, 0);
  const hasVariants = questions.some((q) => q.variant !== null);

  return (
    <div className="max-w-3xl pb-16">
      <Breadcrumb
        items={[
          { label: "Assessments", href: "/assessments" },
          { label: assessment.title, href: `/assessments/${assessmentId}` },
          { label: "Setup" },
        ]}
      />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Setup — {assessment.title}</h1>
        <Link href={`/assessments/${assessmentId}`} className="text-sm text-slate-600 hover:underline">
          Back to assessment
        </Link>
      </div>

      <div className="mt-4 rounded-md border border-slate-200 p-4">
        {completeness.ready ? (
          <p className="text-sm font-medium text-emerald-700">
            Setup complete — status is &ldquo;ready&rdquo;.
          </p>
        ) : (
          <div>
            <p className="text-sm font-medium text-amber-700">Still missing:</p>
            <ul className="mt-1 list-inside list-disc text-sm text-amber-700">
              {completeness.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Name mask */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Name mask</h2>
        <p className="mt-1 text-sm text-slate-600">
          Defines the region blacked out before a scan is sent to the AI. Page 1 is required; add a
          second page if the name is repeated there (e.g. a header on page 2).
        </p>
        {(() => {
          const preview = listSubmissions(assessmentId).find((s) => (s.page_count ?? 0) >= 1) ?? null;
          return (
            <NameMaskEditor
              assessmentId={assessmentId}
              masks={assessment.name_masks}
              paperPageCount={paperPreviewPageCount(assessment.id, assessment.paper_file)}
              previewSubmissionId={preview?.id ?? null}
              previewPageCount={preview?.page_count ?? 0}
            />
          );
        })()}
      </section>

      {/* Questions */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Questions</h2>
          <span className="text-sm text-slate-600">
            Total: {totalPoints} points
            {hasVariants ? ` · modified version: ${modifiedTotal} points` : ""}
          </span>
        </div>
        {fmTest && (
          <p className="mt-1 text-sm text-slate-600">
            Scored as points out of {totalPoints}. Upload the blank test to fill the list in, then
            propose the answer key below. &ldquo;Applies to&rdquo; lets a question belong only to
            the standard or the modified version of the test.
          </p>
        )}

        <div className="mt-4">
          <PaperAutofill assessmentId={assessmentId} />
        </div>

        <div className="mt-4 space-y-3">
          {questions.map((q, idx) => {
            const target = q.learning_target_id ? targetsById.get(q.learning_target_id) : undefined;
            return (
              <form
                key={q.id}
                action={updateQuestionAction.bind(null, assessmentId, q.id)}
                className={`grid grid-cols-1 gap-3 rounded-md border border-slate-200 p-3 sm:items-center ${questionRowCols}`}
              >
                <input
                  name="number"
                  defaultValue={q.number}
                  placeholder="e.g. 3b"
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
                <input
                  name="max_points"
                  type="number"
                  step="0.5"
                  min="0"
                  defaultValue={q.max_points}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
                {fmTest ? (
                  <select
                    name="variant"
                    defaultValue={q.variant ?? ""}
                    title="Applies to"
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">Everyone</option>
                    <option value="standard">Standard only</option>
                    <option value="modified">Modified only</option>
                  </select>
                ) : showBand ? (
                  <select
                    name="level_band"
                    defaultValue={q.level_band ?? undefined}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    {LEVEL_BANDS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                ) : null}
                <LearningTargetCombobox
                  name="learning_target_name"
                  targets={learningTargets}
                  defaultValue={target?.name}
                />
                <div className="flex items-center gap-1">
                  <button
                    type="submit"
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-medium hover:bg-slate-50"
                  >
                    Save
                  </button>
                  <button
                    formAction={moveQuestion.bind(null, assessmentId, q.id, "up")}
                    disabled={idx === 0}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-xs disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    formAction={moveQuestion.bind(null, assessmentId, q.id, "down")}
                    disabled={idx === questions.length - 1}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-xs disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <RemoveQuestionButton
                    number={q.number}
                    footprint={getQuestionDataFootprint(q.id)}
                    formAction={deleteQuestionAction.bind(null, assessmentId, q.id)}
                  />
                </div>
              </form>
            );
          })}
        </div>

        <form
          action={addQuestion.bind(null, assessmentId)}
          className={`mt-4 grid grid-cols-1 gap-3 rounded-md border border-dashed border-slate-300 p-3 sm:items-center ${questionRowCols}`}
        >
          <input
            name="number"
            placeholder="Number (e.g. 3b)"
            required
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <input
            name="max_points"
            type="number"
            step="0.5"
            min="0"
            placeholder="Max points"
            required
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          {fmTest ? (
            <select
              name="variant"
              defaultValue=""
              title="Applies to"
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">Everyone</option>
              <option value="standard">Standard only</option>
              <option value="modified">Modified only</option>
            </select>
          ) : showBand ? (
            <select
              name="level_band"
              defaultValue={LEVEL_BANDS[0]}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              {LEVEL_BANDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          ) : null}
          <LearningTargetCombobox name="learning_target_name" targets={learningTargets} />
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
          >
            Add question
          </button>
        </form>
      </section>

      {/* Level thresholds — Criterion A only; B/C/D are marked against the rubric,
          and a points-only test has no levels at all. */}
      {usesLevelThresholds(assessment) && (
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Level thresholds</h2>
        <p className="mt-1 text-sm text-slate-600">
          Minimum points needed to reach each Criterion A level (1-8), following your existing
          markscheme practice.
        </p>
        <ThresholdsForm assessmentId={assessmentId} thresholds={thresholds} />
      </section>
      )}

      {/* Worked solution */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">
          {fmTest ? "Answer key" : "Worked solution"}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {fmTest
            ? "The key the grader marks against: answers, mark splits, and the rubric for any short-answer question. Have the app propose one from the blank test (and your Word key, if you upload one), then approve or edit it."
            : "Whole-assessment notes: full/partial credit rules, including follow-through."}
        </p>
        <div className="mt-3">
          <WorkedSolutionUpload assessmentId={assessmentId} />
        </div>
        {fmTest && (
          <div className="mt-3">
            <ProposeKey
              assessmentId={assessmentId}
              hasPaper={assessment.paper_file !== null}
              questionCount={questions.length}
            />
          </div>
        )}
        <form action={saveWholeWorkedSolution.bind(null, assessmentId)} className="mt-3 space-y-2">
          <textarea
            name="content"
            defaultValue={wholeSolution?.content ?? ""}
            rows={8}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
            placeholder="General notes: full/partial credit, follow-through rules..."
          />
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Save worked solution notes
          </button>
        </form>

        {questions.length > 0 && (
          <div className="mt-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-800">Per-question notes (optional)</h3>
            {questions.map((q) => (
              <form
                key={q.id}
                action={saveQuestionWorkedSolution.bind(null, assessmentId, q.id)}
                className="space-y-1"
              >
                <label className="text-xs font-medium text-slate-600">Question {q.number}</label>
                <textarea
                  name="content"
                  defaultValue={perQuestionSolutions.get(q.id)?.content ?? ""}
                  rows={3}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
                  placeholder="Optional: notes specific to this question"
                />
                <button
                  type="submit"
                  className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-50"
                >
                  Save
                </button>
              </form>
            ))}
          </div>
        )}
      </section>

      {/* Rubrics */}
      {rubricCriteria.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-slate-900">
            What{" "}
            {rubricCriteria.length === 1
              ? `Criterion ${rubricCriteria[0]} is`
              : `Criteria ${rubricCriteria.slice(0, -1).join(", ")} and ${rubricCriteria[rubricCriteria.length - 1]} are`}{" "}
            marked against
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            The band descriptors below are the anchor — the worked solution above is only a
            reference, since student solution paths may legitimately differ. A band descriptor
            usually asks for several things at once, so it is split into one requirement per row:
            the grader says which were met and you tick them off while reviewing, and the level
            stays yours to set. Most tasks print this table, so it can be read straight off the
            paper.
          </p>
          <ProposeDescriptors
            assessmentId={assessmentId}
            hasPaper={assessment.paper_file !== null}
          />
          <div className="mt-3 space-y-8">
            {rubricCriteria.map((c) => {
              const rubric = rubrics.find((r) => r.criterion === c);
              const hasNotes = (rubric?.content ?? "").trim().length > 0;
              return (
                <div key={c}>
                  <RubricDescriptorEditor
                    criterion={c}
                    descriptors={descriptors.filter((d) => d.criterion === c)}
                    footprints={descriptorFootprints}
                    action={saveRubricDescriptorsAction.bind(null, assessmentId, c)}
                  />

                  {/* The free-text rubric predates the descriptors and now plays a smaller
                      part: notes the table cannot hold. Open when something is written in
                      it, tucked away when there is nothing to see. */}
                  <details className="mt-2" open={hasNotes || undefined}>
                    <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
                      Extra notes for Criterion {c} (optional)
                    </summary>
                    <form
                      action={saveRubric.bind(null, assessmentId, c)}
                      className="mt-2 space-y-1"
                    >
                      <p className="text-xs text-slate-500">
                        Anything the descriptors do not say — how you read a command term for this
                        task, what you will accept as verification. The grader sees it alongside
                        them, and the descriptors win where the two disagree.
                      </p>
                      <textarea
                        name="content"
                        defaultValue={rubric?.content ?? ""}
                        rows={5}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
                      />
                      <button
                        type="submit"
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                      >
                        Save notes
                      </button>
                    </form>
                  </details>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
