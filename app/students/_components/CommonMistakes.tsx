import type { CommonMistake } from "@/lib/students/patterns";

const SIDES = [
  ["maths", "In the maths itself"],
  ["question", "In doing what the question asks"],
] as const;

/**
 * A habit that has stopped, said as plainly as one that has not: the papers
 * marked since it was last seen, none of which showed it.
 */
export function StoppedNote({ lastSeen, papersSince }: { lastSeen: string; papersSince: number }) {
  if (papersSince < 1) return null;
  return (
    <p className="mt-0.5 text-xs font-medium text-emerald-700">
      ✓ Not on the {papersSince === 1 ? "latest paper" : `last ${papersSince} papers`} — last seen in{" "}
      {lastSeen}
    </p>
  );
}

/** The marking phrases behind a count, so a number can always be traced to its sentences. */
export function MarkingQuotes({ quotes }: { quotes: string[] }) {
  if (quotes.length === 0) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-slate-500">What the marking said</summary>
      <ul className="mt-1 space-y-1">
        {quotes.map((q, i) => (
          <li key={i} className="text-xs italic text-slate-600">
            &ldquo;{q}&rdquo;
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * The most common kinds of mistake, split into the maths itself and doing what
 * the question asks. The conference page reads it out; the student page also
 * opens the marking behind each line.
 */
export function CommonMistakesGrid({
  mistakes,
  showQuotes = false,
}: {
  mistakes: CommonMistake[];
  showQuotes?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {SIDES.map(([about, label]) => {
        const rows = mistakes.filter((m) => m.about === about);
        if (rows.length === 0) return null;
        return (
          <div key={about} className="break-inside-avoid rounded-lg border border-slate-200 bg-white p-5">
            <span className="block font-sans text-xs font-semibold uppercase tracking-wider text-slate-600">
              {label}
            </span>
            <ul className="mt-3 space-y-3">
              {rows.map((m) => (
                <li key={m.text}>
                  <p className="text-[15px] font-medium leading-snug">{m.text}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {m.questions} questions · {m.assessmentTitles.join(", ")}
                  </p>
                  <StoppedNote lastSeen={m.lastSeen} papersSince={m.papersSince} />
                  {showQuotes && <MarkingQuotes quotes={m.quotes} />}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
