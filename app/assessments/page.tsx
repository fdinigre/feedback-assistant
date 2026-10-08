import Link from "next/link";
import { listAssessments, listClasses } from "@/lib/db/queries";
import { displayStatus } from "@/lib/assessment/completeness";

// Reads the database on every request: this list must never be served from a
// static render, or a class or assessment added later would not show up.
export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  setup: "bg-amber-100 text-amber-800",
  ready: "bg-emerald-100 text-emerald-800",
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>{status}</span>
  );
}

export default function AssessmentsPage() {
  const assessments = listAssessments();
  const classNameById = new Map(listClasses().map((c) => [c.id, c.name]));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Assessments</h1>
        <Link
          href="/assessments/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          New assessment
        </Link>
      </div>
      <p className="mt-2 text-slate-600">
        Set up assessments, intake scanned submissions, and review grading here.
      </p>

      {assessments.length === 0 ? (
        <p className="mt-8 text-sm text-slate-500">No assessments yet.</p>
      ) : (
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 pr-4 font-medium">Title</th>
              <th className="py-2 pr-4 font-medium">Class</th>
              <th className="py-2 pr-4 font-medium">Grade</th>
              <th className="py-2 pr-4 font-medium">Criteria</th>
              <th className="py-2 pr-4 font-medium">Date</th>
              <th className="py-2 pr-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {assessments.map((a) => (
              <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2 pr-4">
                  <Link
                    href={`/assessments/${a.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {a.title}
                  </Link>
                </td>
                <td className="py-2 pr-4">
                  {a.class_id !== null ? (
                    classNameById.get(a.class_id) ?? "—"
                  ) : (
                    <span className="text-slate-400">All Grade {a.grade}</span>
                  )}
                </td>
                <td className="py-2 pr-4">Grade {a.grade}</td>
                <td className="py-2 pr-4">
                  {a.assessment_type === "fm_test" ? "Points" : a.criteria.join(", ")}
                </td>
                <td className="py-2 pr-4">{a.date ?? "—"}</td>
                <td className="py-2 pr-4">
                  {/* "setup" is a warning, so it opens the page that finishes it. */}
                  {displayStatus(a) === "setup" ? (
                    <Link href={`/assessments/${a.id}/setup`} title="Finish setting this up">
                      <StatusBadge status="setup" />
                    </Link>
                  ) : (
                    <StatusBadge status={displayStatus(a)} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
