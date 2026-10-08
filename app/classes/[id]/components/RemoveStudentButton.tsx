"use client";

import { useActionState } from "react";
import { removeStudentAction, type StudentFormState } from "../actions";

const initialState: StudentFormState = { error: null };

export type StudentFootprint = {
  submissions: number;
  reports: number;
  externalData: number;
};

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Builds the confirmation text. A student with nothing on file gets a plain
 * prompt; one with work gets an itemised list of exactly what will be destroyed,
 * because removing them cascades through every submission and report.
 */
function confirmMessage(studentName: string, footprint: StudentFootprint): string {
  const items: string[] = [];
  if (footprint.submissions > 0) items.push(plural(footprint.submissions, "submission"));
  if (footprint.reports > 0) items.push(plural(footprint.reports, "report"));
  if (footprint.externalData > 0) {
    items.push(`${plural(footprint.externalData, "imported data set")} (MAP/CAT4)`);
  }

  if (items.length === 0) {
    return `Remove ${studentName} from this class?`;
  }

  return [
    `Remove ${studentName} from this class?`,
    "",
    "This permanently deletes their work on file:",
    ...items.map((i) => `  • ${i}`),
    "",
    "Marks, transcripts and feedback for this student go with it. This cannot be undone.",
  ].join("\n");
}

export function RemoveStudentButton({
  studentId,
  studentName,
  footprint,
}: {
  studentId: number;
  studentName: string;
  footprint: StudentFootprint;
}) {
  const [state, formAction, pending] = useActionState(removeStudentAction, initialState);
  const hasWork = footprint.submissions > 0 || footprint.reports > 0;

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(confirmMessage(studentName, footprint))) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="studentId" value={studentId} />
      <button
        type="submit"
        disabled={pending}
        title={
          hasWork
            ? "Removing this student also deletes their submissions and reports."
            : undefined
        }
        className="text-xs font-medium text-red-600 hover:text-red-800 disabled:cursor-not-allowed disabled:text-slate-300"
      >
        {pending ? "Removing…" : "Remove"}
      </button>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
