import Link from "next/link";
import type { ClassGradebook } from "@/lib/students/gradebook";

export function GradebookTable({ gradebook }: { gradebook: ClassGradebook }) {
  const { columns, rows } = gradebook;
  if (columns.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
        No grades yet — this appears once assessments in this class have been graded.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left">
            <th className="sticky left-0 z-10 bg-white px-4 py-2 font-medium text-slate-500">
              Student
            </th>
            {columns.map((c) => (
              <th key={c.assessmentId} className="px-3 py-2 font-medium text-slate-600">
                <Link
                  href={`/assessments/${c.assessmentId}`}
                  className="hover:underline"
                  title={c.title}
                >
                  {c.title}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.studentId} className="border-b border-slate-100 last:border-0">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-4 py-2 font-medium text-slate-900">
                <Link href={`/students/${row.studentId}`} className="hover:text-blue-700 hover:underline">
                  {row.name}
                </Link>
              </td>
              {columns.map((c) => {
                const cell = row.cells[c.assessmentId];
                if (!cell) {
                  return (
                    <td key={c.assessmentId} className="px-3 py-2 text-slate-300">
                      —
                    </td>
                  );
                }
                return (
                  <td key={c.assessmentId} className="px-3 py-2">
                    <Link
                      href={`/submissions/${cell.submissionId}`}
                      className="inline-flex items-baseline gap-1 hover:underline"
                    >
                      <span className="font-semibold text-slate-900">{cell.display}</span>
                      {cell.sub && <span className="text-xs text-slate-500">{cell.sub}</span>}
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
