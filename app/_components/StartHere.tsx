import Link from "next/link";

/**
 * The first three things to do in an empty copy, in order, each ticking off as
 * it is done. Shown until the first assessment exists, which is the point a new
 * teacher has found their way around and the rest of the dashboard has
 * something to say.
 */
export function StartHere({
  classCount,
  firstEmptyClassId,
  studentCount,
  assessmentCount,
  hasVoiceExamples,
}: {
  classCount: number;
  /** A class with no students yet, to send the roster step straight to it. */
  firstEmptyClassId: number | null;
  studentCount: number;
  assessmentCount: number;
  hasVoiceExamples: boolean;
}) {
  const steps = [
    {
      done: classCount > 0,
      title: "Create a class",
      detail: "Its name, MYP or DP, and the course and grade.",
      href: "/classes",
      action: "Go to Classes",
    },
    {
      done: studentCount > 0,
      title: "Add the roster",
      detail:
        "Paste the names from a list or spreadsheet; each student gets a code the AI sees instead.",
      href: firstEmptyClassId !== null ? `/classes/${firstEmptyClassId}` : "/classes",
      action: "Add students",
    },
    {
      done: assessmentCount > 0,
      title: "Set up your first assessment",
      detail: "The questions and their points, then the scanned papers.",
      href: "/assessments/new",
      action: "New assessment",
    },
  ];
  // The first step not yet done is the one to do; later ones wait for it.
  const current = steps.findIndex((s) => !s.done);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-2xl font-semibold">Start here</h2>
      <ol className="mt-5 space-y-4">
        {steps.map((step, i) => (
          <li key={step.title} className="flex items-start gap-4">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-base ${
                step.done
                  ? "bg-emerald-100 text-emerald-800"
                  : i === current
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-500"
              }`}
              aria-hidden
            >
              {step.done ? "✓" : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`font-medium ${step.done ? "text-slate-500 line-through" : "text-slate-900"}`}
              >
                {step.title}
              </p>
              {!step.done && <p className="mt-0.5 text-sm text-slate-600">{step.detail}</p>}
            </div>
            {i === current && (
              <Link
                href={step.href}
                className="shrink-0 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                {step.action}
              </Link>
            )}
          </li>
        ))}
      </ol>
      {!hasVoiceExamples && (
        <p className="mt-5 border-t border-slate-100 pt-4 text-sm text-slate-600">
          Also worth doing once:{" "}
          <Link
            href="/settings"
            className="font-medium text-slate-900 underline underline-offset-2"
          >
            paste two of your own feedback comments
          </Link>{" "}
          so the reports are written in your voice.
        </p>
      )}
    </section>
  );
}
