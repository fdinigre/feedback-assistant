import { courseLabel } from "@/lib/assessment/course";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getClass,
  getClassPlan,
  getClassPlanSummary,
  getStudentDataFootprint,
  listExternalData,
  listStudents,
} from "@/lib/db/queries";
import type { ExternalDataSource } from "@/lib/types";
import { computeClassMastery } from "@/lib/students/mastery";
import { computeClassGradebook } from "@/lib/students/gradebook";
import { MasteryList } from "@/app/students/[id]/_components/MasteryList";
import { GradebookTable } from "./components/GradebookTable";
import { Breadcrumb } from "@/app/_components/Breadcrumb";
import { AddStudentForm } from "./components/AddStudentForm";
import { BulkAddStudents } from "./components/BulkAddStudents";
import { RemoveStudentButton } from "./components/RemoveStudentButton";
import { YearPlanImport, type LoadedPlan } from "./components/YearPlanImport";
import { ImportExternalData } from "./components/ImportExternalData";

const SOURCE_ORDER: ExternalDataSource[] = ["MAP", "CAT4", "PRIOR_GRADES", "ATL"];
const SOURCE_LABELS: Record<ExternalDataSource, string> = {
  MAP: "MAP",
  CAT4: "CAT4",
  PRIOR_GRADES: "Prior grades",
  ATL: "ATL",
};

export default async function ClassRosterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const classId = Number(id);
  const cls = Number.isFinite(classId) ? getClass(classId) : undefined;
  if (!cls) notFound();

  const students = listStudents(classId);

  // The year plan this class follows, if one has been loaded.
  const planReceipt = getClassPlan(classId);
  const planSummary = planReceipt ? getClassPlanSummary(classId) : null;
  const loadedPlan: LoadedPlan | null =
    planReceipt && planSummary
      ? {
          fileName: planReceipt.file_name,
          startYear: planReceipt.start_year,
          uploadedAt: planReceipt.uploaded_at,
          entries: planSummary.entries,
          lessons: planSummary.lessons,
          breaks: planSummary.breaks,
          firstDate: planSummary.firstDate,
          lastDate: planSummary.lastDate,
        }
      : null;
  const classMastery = computeClassMastery(classId);
  const gradebook = computeClassGradebook(classId);
  const roster = students.map((student) => {
    const sources = new Set(listExternalData(student.id).map((row) => row.source));
    const missingCorrelationData = !sources.has("MAP") && !sources.has("CAT4");
    return {
      student,
      sources,
      missingCorrelationData,
      footprint: getStudentDataFootprint(student.id),
    };
  });

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Breadcrumb items={[{ label: "Classes", href: "/classes" }, { label: cls.name }]} />
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{cls.name}</h1>
          <span
            className={
              cls.programme === "DP"
                ? "rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800"
                : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
            }
          >
            {cls.programme}
          </span>
        </div>
        <p className="text-slate-600">
          {courseLabel(cls)}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Roster ({roster.length})</h2>
        {roster.length === 0 ? (
          <p className="text-sm text-slate-500">No students yet — add them below.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Pseudonym</th>
                  <th className="py-2 pr-4 font-medium">External data</th>
                  <th className="py-2 pr-4 font-medium">Data status</th>
                  <th className="py-2 pr-4 font-medium" />
                </tr>
              </thead>
              <tbody>
                {roster.map(({ student, sources, missingCorrelationData, footprint }) => (
                  <tr key={student.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium">
                      <Link
                        href={`/students/${student.id}`}
                        className="text-slate-900 hover:text-blue-700 hover:underline"
                      >
                        {student.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-500">
                      {student.pseudonym}
                      {student.modified && (
                        <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-800">
                          modified
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {SOURCE_ORDER.filter((source) => sources.has(source)).map((source) => (
                          <Badge key={source} label={SOURCE_LABELS[source]} />
                        ))}
                        {sources.size === 0 && <span className="text-slate-400">none</span>}
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      {missingCorrelationData ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          Missing MAP/CAT4 — Data Correlation will be skipped
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <RemoveStudentButton
                        studentId={student.id}
                        studentName={student.name}
                        footprint={footprint}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-8 md:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-lg font-medium">Add a student</h2>
          <AddStudentForm classId={classId} />
        </div>
        <div className="space-y-3">
          <h2 className="text-lg font-medium">Bulk add students</h2>
          <p className="text-sm text-slate-600">
            Paste a class list (one name per line, or a CSV with a Name column) or choose a file, then
            click <span className="font-medium">Add students</span>. Anyone already in the roster is
            skipped automatically.
          </p>
          <BulkAddStudents classId={classId} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Gradebook</h2>
        <p className="text-sm text-slate-600">
          Every student&rsquo;s grade on each graded assessment. DP shows the 1–7 grade with its
          percentage; MYP shows the criterion levels. Click a grade to open that submission.
        </p>
        <GradebookTable gradebook={gradebook} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Class learning-target mastery</h2>
        <p className="text-sm text-slate-600">
          Aggregate marks per learning target across every student&rsquo;s graded assessments —
          weakest first. Use it to see which targets the class as a whole struggled with.
        </p>
        <MasteryList rows={classMastery} />
      </section>


      {/* Anchored: the conference pages link here when no plan is loaded. */}
      <section id="year-plan" className="scroll-mt-4 space-y-3">
        <h2 className="text-lg font-medium">Year plan</h2>
        <YearPlanImport classId={classId} loaded={loadedPlan} />
      </section>

      {/* Anchored: "nothing imported" notices elsewhere link here. */}
      <section id="import" className="scroll-mt-4 space-y-3">
        <h2 className="text-lg font-medium">Import external data</h2>
        <p className="text-sm text-slate-600">
          MAP, CAT4, prior year grades (A-D), and ATL. Rows are matched to the roster by name
          (unmatched rows can be mapped manually or skipped); blank rows are skipped silently.
          Re-importing replaces each student&apos;s previous record for that source — except prior
          grades, which are kept per semester: a sheet carrying a School year and a Semester sits
          beside the ones already on file instead of replacing them. Data Correlation in the report
          is skipped only when both MAP and CAT4 are missing for a student.
        </p>
        <ImportExternalData classId={classId} students={students} />
      </section>
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
      {label} ✓
    </span>
  );
}
