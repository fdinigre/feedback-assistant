import type { MasteryRow } from "@/lib/students/mastery";

function barColor(pct: number): string {
  if (pct < 40) return "bg-red-400";
  if (pct < 70) return "bg-amber-400";
  return "bg-emerald-400";
}

export function MasteryList({ rows }: { rows: MasteryRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
        No learning-target data yet — mastery appears once questions tagged with a learning
        target have been graded.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.learningTargetId} className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm font-medium text-slate-900">{row.name}</span>
            <span className="shrink-0 text-sm text-slate-600">
              {row.earned}/{row.max} ({row.pct.toFixed(0)}%)
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full ${barColor(row.pct)}`}
              style={{ width: `${Math.min(100, Math.max(0, row.pct))}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {row.studentCount != null && (
              <>
                {row.studentCount} student{row.studentCount === 1 ? "" : "s"} ·{" "}
              </>
            )}
            {row.questionCount} question{row.questionCount === 1 ? "" : "s"} across{" "}
            {row.assessmentTitles.join(", ")}
          </p>
        </li>
      ))}
    </ul>
  );
}
