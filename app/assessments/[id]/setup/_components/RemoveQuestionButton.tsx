"use client";

export type QuestionFootprint = {
  transcripts: number;
  gradings: number;
  students: number;
};

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Removing a question also removes every student's answer and marks for it.
 * That used to fail outright once any paper had been transcribed; now it works,
 * which makes an explicit warning necessary rather than optional — the click
 * destroys marking for the whole class.
 */
function confirmMessage(number: string, f: QuestionFootprint): string {
  if (f.gradings === 0 && f.transcripts === 0) {
    return `Remove question ${number}?`;
  }
  return [
    `Remove question ${number}?`,
    "",
    `This also deletes its marks and transcribed answers for ${plural(f.students, "student")}:`,
    `  • ${plural(f.gradings, "mark")}`,
    `  • ${plural(f.transcripts, "transcribed answer")}`,
    "",
    "Criterion levels and reports were calculated from these marks and will be out of date.",
    "This cannot be undone.",
  ].join("\n");
}

export function RemoveQuestionButton({
  number,
  footprint,
  formAction,
}: {
  number: string;
  footprint: QuestionFootprint;
  formAction: string | ((formData: FormData) => void | Promise<void>);
}) {
  const hasWork = footprint.gradings > 0 || footprint.transcripts > 0;

  return (
    <button
      formAction={formAction}
      onClick={(e) => {
        if (!window.confirm(confirmMessage(number, footprint))) {
          e.preventDefault();
        }
      }}
      title={
        hasWork
          ? `Also deletes marks for ${footprint.students} student${footprint.students === 1 ? "" : "s"}`
          : undefined
      }
      className="rounded-md border border-red-200 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50"
    >
      Remove
    </button>
  );
}
