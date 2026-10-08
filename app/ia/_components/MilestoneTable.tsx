import Link from "next/link";
import { IA_MILESTONES } from "@/lib/types";
import { MILESTONE_LABELS } from "./DeadlineEditor";

export type MilestoneRow = {
  student: { id: number; name: string };
  doneMap: Record<string, string>;
};

type Status = "done" | "late" | "pending";

function statusOf(done: string | undefined, due: string | undefined): Status {
  if (done) return "done";
  if (due && new Date(due) < new Date()) return "late";
  return "pending";
}

function Chip({ status, date }: { status: Status; date?: string }) {
  if (status === "done") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
        ✓ {date?.slice(0, 10)}
      </span>
    );
  }
  if (status === "late") {
    return (
      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">
        Late
      </span>
    );
  }
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      Pending
    </span>
  );
}

export function MilestoneTable({
  rows,
  deadlineMap,
}: {
  rows: MilestoneRow[];
  deadlineMap: Record<string, string>;
}) {
  if (rows.length === 0) {
    return (
      <p className="mt-3 rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
        No students in this class yet.
      </p>
    );
  }

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="px-4 py-2 font-medium">Student</th>
            {IA_MILESTONES.map((m) => (
              <th key={m} className="px-4 py-2 font-medium">
                {MILESTONE_LABELS[m]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ student, doneMap }) => (
            <tr key={student.id} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-2 font-medium text-slate-900">
                <Link href={`/ia/${student.id}`} className="hover:underline">
                  {student.name}
                </Link>
              </td>
              {IA_MILESTONES.map((m) => {
                const status = statusOf(doneMap[m], deadlineMap[m]);
                return (
                  <td key={m} className="px-4 py-2">
                    <Chip status={status} date={doneMap[m]} />
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
