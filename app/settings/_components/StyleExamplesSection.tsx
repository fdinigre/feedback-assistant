import type { StyleExampleRow } from "@/lib/types";
import { AddStyleExampleForm } from "./AddStyleExampleForm";
import { DeleteStyleExampleButton } from "./DeleteStyleExampleButton";

export function StyleExamplesSection({
  commentExamples,
  reportExamples,
}: {
  commentExamples: StyleExampleRow[];
  reportExamples: StyleExampleRow[];
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Feedback voice — style examples</h2>
        <p className="mt-1 text-sm text-slate-600">
          Paste two or three comments you have written to students yourself. The AI reads the first
          two before writing every report, so the feedback comments come out in your voice — your
          tone, your structure, how direct you are — rather than a generic one. Write{" "}
          <code className="rounded bg-slate-100 px-1">{"{{NAME}}"}</code> where the student&apos;s
          name was; any name from your rosters is swapped for it automatically.
        </p>
      </div>

      {commentExamples.length === 0 ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No examples yet, so reports are written in a plain teacher&apos;s voice. Adding two of your
          own comments is the single biggest improvement to what the reports sound like.
        </p>
      ) : (
        <ul className="space-y-3">
          {commentExamples.map((ex, i) => (
            <li key={ex.id} className="rounded-lg border border-slate-200 p-3">
              {i >= 2 && (
                <p className="mb-2 text-xs text-slate-500">
                  Kept, but not used: only the first two are given to the AI.
                </p>
              )}
              <textarea
                readOnly
                defaultValue={ex.content}
                rows={4}
                className="w-full resize-y rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              />
              <div className="mt-2 flex justify-end">
                <DeleteStyleExampleButton id={ex.id} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="max-w-xl">
        <h3 className="text-sm font-semibold text-slate-900">Add a new example</h3>
        <AddStyleExampleForm />
      </div>

      {reportExamples.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Report structure reference</h3>
          <p className="mt-1 text-xs text-slate-500">
            Read-only — defines the section structure the AI must follow when writing full
            reports. Managed by the pipeline, not editable here.
          </p>
          <ul className="mt-2 space-y-2">
            {reportExamples.map((ex) => (
              <li key={ex.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <textarea
                  readOnly
                  defaultValue={ex.content}
                  rows={8}
                  className="w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
