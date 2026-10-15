"use client";

import { setNoNameMask } from "@/lib/assessment/actions";

/**
 * The way out of the name mask, for papers that carry no student names. Turning it
 * on is a statement about every page of every paper, so it says what it means
 * before it takes effect: pages go as they are, and only a typed PDF can be checked.
 */
export function NoNameMaskToggle({ assessmentId, on }: { assessmentId: number; on: boolean }) {
  const action = setNoNameMask.bind(null, assessmentId);

  if (on) {
    return (
      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-medium">No name mask — these papers carry no student names.</p>
        <p className="mt-1">
          Pages are sent to the AI as they are. A typed PDF is checked for names from the class
          list first and held back if it has one; a scan can&apos;t be checked, so only use this
          when you know no page shows a name.
        </p>
        <form action={action} className="mt-2">
          <button
            type="submit"
            className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-amber-100"
          >
            Use a name mask after all
          </button>
        </form>
      </div>
    );
  }

  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="no_name_mask" value="on" />
      <button
        type="submit"
        onClick={(e) => {
          const ok = window.confirm(
            "Send these papers without a name mask?\n\n" +
              "Only do this if no page of any paper shows a student's name. Pages go to the AI as they are. " +
              "A typed PDF is checked for names from the class list first; a scan can't be checked."
          );
          if (!ok) e.preventDefault();
        }}
        className="text-xs text-slate-600 underline underline-offset-2 hover:text-slate-900"
      >
        These papers carry no student names — no mask needed
      </button>
    </form>
  );
}
