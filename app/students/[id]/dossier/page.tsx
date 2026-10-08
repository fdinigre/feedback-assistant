import Link from "next/link";
import { getClass, getStudent } from "@/lib/db/queries";
import { getStudentDossier } from "@/lib/render/dossier";
import { injectNameSections } from "@/lib/render/names";
import { Breadcrumb } from "@/app/_components/Breadcrumb";

export const dynamic = "force-dynamic";

export default async function StudentDossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const studentId = Number(id);
  const student = getStudent(studentId);

  if (!student) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Student not found</h1>
        <p className="mt-2 text-slate-600">
          No student exists with id {id}. Check the roster in{" "}
          <Link href="/classes" className="underline underline-offset-2">
            Classes
          </Link>
          .
        </p>
      </div>
    );
  }

  const entries = getStudentDossier(studentId);
  const cls = getClass(student.class_id);

  return (
    <div>
      <Breadcrumb
        items={[
          { label: "Students", href: "/students" },
          ...(cls ? [{ label: cls.name, href: `/classes/${cls.id}` }] : []),
          { label: student.name, href: `/students/${studentId}` },
          { label: "Dossier" },
        ]}
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{student.name} — Dossier</h1>
          <p className="mt-1 text-sm text-slate-500">
            Pseudonym {student.pseudonym} · {entries.length} approved report
            {entries.length === 1 ? "" : "s"}
          </p>
        </div>
        <a
          href={`/api/export/dossier/${studentId}`}
          className="shrink-0 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Download as Markdown
        </a>
      </div>

      {entries.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
          No approved reports yet. Reports appear here once a submission for this student has
          been reviewed and approved.
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {entries.map(({ assessment, submission, report }) => {
            const sections = injectNameSections(report.sections, student.name, student.pseudonym);
            return (
              <article
                key={submission.id}
                className="rounded-lg border border-slate-200 bg-white p-6"
              >
                <header className="mb-4 flex items-baseline justify-between gap-4">
                  <h2 className="text-lg font-semibold tracking-tight">
                    {assessment.title}
                  </h2>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500">
                      {assessment.date ?? assessment.created_at.slice(0, 10)}
                    </span>
                    <Link
                      href={`/submissions/${submission.id}`}
                      className="text-sm font-medium text-slate-700 underline hover:text-slate-900"
                    >
                      Open submission
                    </Link>
                  </div>
                </header>

                <section className="mb-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Data Correlation (Internal Insight)
                  </h3>
                  <p className="mt-1 whitespace-pre-wrap text-slate-800">
                    {sections.dataCorrelation ?? (
                      <span className="italic text-slate-400">
                        No external data (MAP/CAT4) on file for this student.
                        {cls && (
                          <>
                            {" "}
                            <Link href={`/classes/${cls.id}#import`} className="underline underline-offset-2">
                              Import it on the class page
                            </Link>
                            .
                          </>
                        )}
                      </span>
                    )}
                  </p>
                </section>

                <section className="mb-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Strengths
                  </h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-800">
                    {sections.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </section>

                <section className="mb-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Areas for Improvement
                  </h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-800">
                    {sections.areasForImprovement.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </section>

                <section className="mb-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Actionable Steps
                  </h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-800">
                    {sections.actionableSteps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Feedback Comment
                  </h3>
                  <p className="mt-1 whitespace-pre-wrap text-slate-800">
                    {sections.feedbackComment}
                  </p>
                </section>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
