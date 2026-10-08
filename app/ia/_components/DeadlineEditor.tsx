import { IA_MILESTONES, type IaMilestone } from "@/lib/types";
import { saveDeadlinesAction } from "../actions";

export const MILESTONE_LABELS: Record<IaMilestone, string> = {
  topic_proposed: "Topic proposed",
  topic_approved: "Topic approved",
  draft_submitted: "Draft submitted",
  feedback_given: "Feedback given",
  final_submitted: "Final submitted",
  marked: "Marked",
};

export function DeadlineEditor({
  classId,
  deadlineMap,
}: {
  classId: number;
  deadlineMap: Record<string, string>;
}) {
  return (
    <form
      action={saveDeadlinesAction.bind(null, classId)}
      className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3 lg:grid-cols-6"
    >
      {IA_MILESTONES.map((m) => (
        <div key={m}>
          <label className="block text-xs font-medium text-slate-600">{MILESTONE_LABELS[m]}</label>
          <input
            type="date"
            name={`due_${m}`}
            defaultValue={deadlineMap[m]?.slice(0, 10) ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
      ))}
      <div className="col-span-full">
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          Save deadlines
        </button>
      </div>
    </form>
  );
}
