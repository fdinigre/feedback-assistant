import { IA_MILESTONES, type IaMilestone } from "@/lib/types";
import { MILESTONE_LABELS } from "@/app/ia/_components/DeadlineEditor";
import { toggleMilestoneAction } from "../../actions";

const MANUAL: IaMilestone[] = ["topic_proposed", "topic_approved"];

export function MilestoneList({
  studentId,
  doneMap,
  deadlineMap,
}: {
  studentId: number;
  doneMap: Record<string, string>;
  deadlineMap: Record<string, string>;
}) {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {IA_MILESTONES.map((m) => {
        const done = doneMap[m];
        const due = deadlineMap[m];
        const late = !done && !!due && new Date(due) < new Date();
        return (
          <li
            key={m}
            className={`rounded-md border p-3 ${
              done
                ? "border-emerald-200 bg-emerald-50"
                : late
                  ? "border-rose-200 bg-rose-50"
                  : "border-slate-200 bg-white"
            }`}
          >
            <p className="text-sm font-medium text-slate-900">{MILESTONE_LABELS[m]}</p>
            <p className="mt-1 text-xs text-slate-600">
              {done
                ? `Done — ${done.slice(0, 10)}`
                : late
                  ? "Late"
                  : due
                    ? `Due ${due.slice(0, 10)}`
                    : "Pending"}
            </p>
            {MANUAL.includes(m) ? (
              <form action={toggleMilestoneAction.bind(null, studentId, m)} className="mt-2">
                <input type="hidden" name="complete" value={done ? "false" : "true"} />
                <button
                  type="submit"
                  className="rounded border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-100"
                >
                  {done ? "Mark not done" : "Mark done"}
                </button>
              </form>
            ) : (
              <p className="mt-2 text-xs text-slate-400">Set automatically</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
