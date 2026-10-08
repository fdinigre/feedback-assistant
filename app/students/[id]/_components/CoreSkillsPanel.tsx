import Link from "next/link";

import { MarkingQuotes, StoppedNote } from "@/app/students/_components/CommonMistakes";
import type { CoreSkillStanding } from "@/lib/students/patterns";

/**
 * The skills underneath every unit, where they have cost marks. Read from the
 * core-skill tags on each paper; a skill on two or more tasks is the thing to
 * keep an eye on all year, whatever the next unit is about.
 */
export function CoreSkillsPanel({
  skills,
  scanned,
  graded,
  unsorted,
}: {
  skills: CoreSkillStanding[];
  /** Graded papers that have been through the skills pass, out of `graded`. */
  scanned: number;
  graded: number;
  /** Tasks whose paper has not been through the skills pass yet: each a link to run it. */
  unsorted: { assessmentId: number; title: string }[];
}) {
  // "Sort the mistakes" runs from an assessment's submissions page, so that is
  // where each of these goes.
  const unsortedLinks = unsorted.map((t, i) => (
    <span key={t.assessmentId}>
      {i > 0 && ", "}
      <Link href={`/assessments/${t.assessmentId}/submissions`} className="underline underline-offset-2">
        {t.title}
      </Link>
    </span>
  ));

  if (graded === 0) {
    return <p className="text-sm text-slate-500">No graded work yet.</p>;
  }
  if (scanned === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
        Not sorted yet. Core skills are read from the marking once a paper has been through
        &ldquo;Sort the mistakes&rdquo; on its assessment&rsquo;s submissions page: {unsortedLinks}.
      </p>
    );
  }

  const recurring = skills.filter((s) => s.assessmentTitles.length >= 2);
  const once = skills.filter((s) => s.assessmentTitles.length < 2);

  return (
    <div className="space-y-4">
      {skills.length === 0 ? (
        <p className="text-sm text-slate-600">
          No core skill has cost marks on the papers sorted so far.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { title: "On more than one task", rows: recurring },
            { title: "On one task so far", rows: once },
          ]
            .filter((group) => group.rows.length > 0)
            .map((group) => (
              <div key={group.title} className="rounded-lg border border-slate-200 bg-white p-5">
                <span className="block font-sans text-xs font-semibold uppercase tracking-wider text-slate-600">
                  {group.title}
                </span>
                <ul className="mt-3 space-y-3">
                  {group.rows.map((s) => (
                    <li key={s.id}>
                      <p className="text-[15px] font-medium leading-snug">{s.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {s.questions} question{s.questions === 1 ? "" : "s"} ·{" "}
                        {s.assessmentTitles.join(", ")}
                      </p>
                      <StoppedNote lastSeen={s.lastSeen} papersSince={s.papersSince} />
                      <MarkingQuotes quotes={s.quotes} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}
      {scanned < graded && (
        <p className="text-xs text-slate-500">
          From {scanned} of {graded} graded papers. Not sorted yet: {unsortedLinks}.
        </p>
      )}
    </div>
  );
}
