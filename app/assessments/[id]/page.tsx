import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssessment, getClass, listQuestions, listSubmissions } from "@/lib/db/queries";
import { DeleteAssessmentButton } from "./_components/DeleteAssessmentButton";
import { isFmTest } from "@/lib/assessment/course";
import { computeCompleteness, displayStatus } from "@/lib/assessment/completeness";
import { Breadcrumb } from "@/app/_components/Breadcrumb";

const DP_TYPE_LABEL: Record<string, string> = {
  quiz: "Quiz (formative)",
  unit_test: "Unit test (summative)",
};

export default async function AssessmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const assessmentId = Number(id);
  const assessment = getAssessment(assessmentId);
  if (!assessment) notFound();

  const completeness = computeCompleteness(assessmentId);
  const isDp = assessment.programme === "DP";
  const dpYearLabel = assessment.grade === 11 ? "Year 1" : assessment.grade === 12 ? "Year 2" : null;
  // Which class sits this assessment. NULL on rows created before assessments
  // were class-scoped — those still cover the whole grade.
  const cls = assessment.class_id !== null ? getClass(assessment.class_id) : undefined;
  const classLabel = cls ? cls.name : `All Grade ${assessment.grade} classes`;

  return (
    <div>
      <Breadcrumb
        items={[
          { label: "Assessments", href: "/assessments" },
          { label: assessment.title },
        ]}
      />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{assessment.title}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {isDp ? (
              <>
                DP · {classLabel} · {dpYearLabel ?? `Grade ${assessment.grade}`} ·{" "}
                {DP_TYPE_LABEL[assessment.assessment_type ?? ""] ?? assessment.assessment_type} ·{" "}
                {assessment.date ?? "No date set"}
              </>
            ) : isFmTest(assessment) ? (
              <>
                MYP · {classLabel} · Grade {assessment.grade} · Points test, out of{" "}
                {listQuestions(assessmentId)
                  .filter((q) => q.variant !== "modified")
                  .reduce((sum, q) => sum + q.max_points, 0)}{" "}
                · {assessment.date ?? "No date set"}
              </>
            ) : (
              <>
                {classLabel} · Grade {assessment.grade} · Criteria{" "}
                {assessment.criteria.join(", ")} · {assessment.date ?? "No date set"}
              </>
            )}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          {displayStatus(assessment)}
        </span>
      </div>

      <div className="mt-6 flex gap-3">
        <Link
          href={`/assessments/${assessment.id}/setup`}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Setup
        </Link>
        <Link
          href={`/assessments/${assessment.id}/submissions`}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Submissions
        </Link>
        <div className="ml-auto">
          <DeleteAssessmentButton
            assessmentId={assessment.id}
            title={assessment.title}
            submissions={listSubmissions(assessmentId).filter((s) => s.status !== "absent").length}
          />
        </div>
      </div>

      {isDp && <DpSummary assessment={assessment} assessmentId={assessmentId} />}

      <div className="mt-8 rounded-md border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-900">Setup completeness</h2>
        {completeness.ready ? (
          <p className="mt-2 text-sm text-emerald-700">
            Setup is complete — this assessment is ready.
          </p>
        ) : (
          <>
            <ul className="mt-2 list-inside list-disc text-sm text-amber-700">
              {completeness.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <Link
              href={`/assessments/${assessmentId}/setup`}
              className="mt-2 inline-block text-sm font-medium text-blue-700 underline"
            >
              Finish it in Setup
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

/** DP-only: total marks and the grade boundary table (spec item 4). */
function DpSummary({
  assessment,
  assessmentId,
}: {
  assessment: NonNullable<ReturnType<typeof getAssessment>>;
  assessmentId: number;
}) {
  const questions = listQuestions(assessmentId);
  const totalMarks = questions.reduce((sum, q) => sum + q.max_points, 0);
  const boundaries = [...(assessment.boundaries ?? [])].sort((a, b) => a.grade - b.grade);

  return (
    <div className="mt-6 rounded-md border border-slate-200 p-4">
      <h2 className="text-sm font-semibold text-slate-900">DP marking</h2>
      <p className="mt-2 text-sm text-slate-700">
        {questions.length} question{questions.length === 1 ? "" : "s"} · {totalMarks} marks total
      </p>
      {boundaries.length > 0 ? (
        <table className="mt-3 w-full max-w-md border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-1 pr-4 font-medium">Grade</th>
              <th className="py-1 pr-4 font-medium">Floor</th>
            </tr>
          </thead>
          <tbody>
            {boundaries.map((b) => (
              <tr key={b.grade} className="border-b border-slate-100">
                <td className="py-1 pr-4">{b.grade}</td>
                <td className="py-1 pr-4">{b.minPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-2 text-sm text-slate-500">
          No grade boundaries set yet —{" "}
          <Link href={`/assessments/${assessmentId}/setup`} className="underline underline-offset-2">
            set them in Setup
          </Link>
          .
        </p>
      )}
    </div>
  );
}
