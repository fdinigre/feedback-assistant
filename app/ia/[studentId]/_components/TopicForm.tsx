import { saveTopicAction } from "../../actions";

export function TopicForm({ studentId, topic }: { studentId: number; topic: string | null }) {
  return (
    <form action={saveTopicAction.bind(null, studentId)} className="flex flex-wrap items-end gap-2">
      <div className="min-w-[240px] flex-1">
        <label className="block text-sm font-medium text-slate-700">Topic</label>
        <input
          name="topic"
          defaultValue={topic ?? ""}
          placeholder="e.g. Modeling traffic flow with differential equations"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        Save topic
      </button>
    </form>
  );
}
