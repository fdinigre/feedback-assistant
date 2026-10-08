import Link from "next/link";
import { Breadcrumb } from "@/app/_components/Breadcrumb";
import { dpCourseYear } from "@/lib/assessment/course";
import {
  getClassesByProgramme,
  getIaExplorationByStudent,
  listIaDeadlines,
  listIaProgress,
  listStudents,
} from "@/lib/db/queries";
import { DeadlineEditor } from "./_components/DeadlineEditor";
import { IaRoster, type RosterRow } from "./_components/IaRoster";

export const dynamic = "force-dynamic";

export default async function IaPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>;
}) {
  const { classId: classIdRaw } = await searchParams;
  const dpClasses = getClassesByProgramme("DP");
  const selectedClassId = classIdRaw ? Number(classIdRaw) : dpClasses[0]?.id;
  const selectedClass = dpClasses.find((c) => c.id === selectedClassId) ?? null;

  const deadlines = selectedClass ? listIaDeadlines(selectedClass.id) : [];
  const deadlineMap = Object.fromEntries(deadlines.map((d) => [d.milestone, d.due_date]));

  const students = selectedClass ? listStudents(selectedClass.id) : [];
  const rows: RosterRow[] = students.map((student) => {
    const exploration = getIaExplorationByStudent(student.id);
    const progress = exploration ? listIaProgress(exploration.id) : [];
    const doneMap = Object.fromEntries(progress.map((p) => [p.milestone, p.completed_at]));
    return { student, doneMap, topic: exploration?.topic ?? "" };
  });

  return (
    <div className="space-y-8">
      <Breadcrumb items={[{ label: "IA Explorations" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">IA Explorations</h1>
        <p className="mt-2 text-slate-600">
          Track topic, draft feedback, and final marking milestones for DP classes.
        </p>
      </div>

      {dpClasses.length === 0 ? (
        <p className="rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
          No DP classes yet — create one from{" "}
          <Link href="/classes" className="underline">
            Classes
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {dpClasses.map((c) => (
              <Link
                key={c.id}
                href={`/ia?classId=${c.id}`}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                  c.id === selectedClassId
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 hover:bg-slate-50"
                }`}
              >
                {c.name} — {dpCourseYear(c)}
              </Link>
            ))}
          </div>

          {selectedClass && (
            <>
              <section>
                <h2 className="text-lg font-medium">Class deadlines</h2>
                <DeadlineEditor classId={selectedClass.id} deadlineMap={deadlineMap} />
              </section>

              <section>
                <h2 className="text-lg font-medium">Students ({rows.length})</h2>
                <IaRoster rows={rows} deadlineMap={deadlineMap} classId={selectedClass.id} />
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
