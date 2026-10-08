import Link from "next/link";
import {
  getApplicableMarkingInstructions,
  getAssessment,
  getDpResult,
  getReport,
  getStudent,
  getSubmission,
  listCriterionLevels,
  listDescriptorChecks,
  listRubricDescriptors,
  listGradings,
  listQuestions,
  listTranscripts,
} from "@/lib/db/queries";
import { computeSubmissionNav } from "@/lib/submissions/nav";
import { questionsForStudent } from "@/lib/assessment/course";
import { listWaitingDifferencesForSubmission } from "@/lib/marks-import/pending";
import { listDpGradings } from "@/lib/submissions/dp-grading";
import { warningsWithoutMissingNameMask } from "@/lib/intake/batch";
import { ReviewClient } from "./_components/ReviewClient";
import { DpReviewClient } from "./_components/DpReviewClient";
import { MarkingNotes } from "./_components/MarkingNotes";

export const dynamic = "force-dynamic";

export default async function SubmissionReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const submissionId = Number(id);
  const submission = getSubmission(submissionId);

  if (!submission) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Submission not found</h1>
        <p className="mt-2 text-slate-600">No submission exists with id {id}.</p>
      </div>
    );
  }

  const assessment = getAssessment(submission.assessment_id);
  if (!assessment) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assessment not found</h1>
        <p className="mt-2 text-slate-600">
          This submission references an assessment that no longer exists.
        </p>
      </div>
    );
  }

  if (submission.status === "absent") {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{assessment.title}</h1>
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-600">
          This student is marked <span className="font-semibold">absent</span> and is excluded
          from batch outputs (report, Toddle comment, spreadsheet row, cover summary).{" "}
          <Link
            href={`/assessments/${assessment.id}/submissions#absent`}
            className="font-medium text-blue-700 underline"
          >
            Undo it on the submissions page
          </Link>
          .
        </div>
      </div>
    );
  }

  // Drop the upload-time "no name mask configured" warning once the assessment
  // has a mask: saving one re-masks the already-uploaded scans, so the stored
  // warning no longer describes the pages that get sent to the AI.
  const reviewed =
    assessment.name_masks.length > 0
      ? {
          ...submission,
          warnings: (() => {
            const kept = warningsWithoutMissingNameMask(submission.warnings);
            return kept.length > 0 ? kept : null;
          })(),
        }
      : submission;

  const student = submission.student_id ? (getStudent(submission.student_id) ?? null) : null;
  // A modified student sits the modified variant of the paper.
  const questions = questionsForStudent(listQuestions(assessment.id), student);
  const transcripts = listTranscripts(submission.id);
  const report = getReport(submission.id) ?? null;
  const nav = computeSubmissionNav(assessment.id, submission.id);
  const markingNotes = getApplicableMarkingInstructions(assessment.id);

  if (assessment.programme === "DP") {
    const dpGradings = listDpGradings(submission.id);
    const dpResult = getDpResult(submission.id) ?? null;

    return (
      <div className="space-y-4">
        <MarkingNotes
          assessmentId={assessment.id}
          programme={assessment.programme}
          applicable={markingNotes}
        />
        <DpReviewClient
          submission={reviewed}
          assessment={assessment}
          student={student}
          questions={questions}
          transcripts={transcripts}
          dpGradings={dpGradings}
          dpResult={dpResult}
          report={report}
          nav={nav}
        />
      </div>
    );
  }

  const gradings = listGradings(submission.id);
  const criterionLevels = listCriterionLevels(submission.id);
  const rubricDescriptors = listRubricDescriptors(assessment.id);
  const descriptorChecks = listDescriptorChecks(submission.id);
  const sheetDifferences = listWaitingDifferencesForSubmission(assessment.id, submission.id);

  return (
    <div className="space-y-4">
      <MarkingNotes
        assessmentId={assessment.id}
        programme={assessment.programme}
        applicable={markingNotes}
      />
      <ReviewClient
      submission={reviewed}
      assessment={assessment}
      student={student}
      questions={questions}
      transcripts={transcripts}
      gradings={gradings}
      criterionLevels={criterionLevels}
      rubricDescriptors={rubricDescriptors}
      descriptorChecks={descriptorChecks}
      sheetDifferences={sheetDifferences}
      report={report}
      nav={nav}
      />
    </div>
  );
}
