import type { AreaBullet, Recurrence, UnattemptedSignal } from "@/lib/students/patterns";
import type { MasteryRow } from "@/lib/students/mastery";
import { MasteryList } from "./MasteryList";
import { AiDigestPanel } from "./AiDigestPanel";
import type { StudentInsights } from "@/lib/students/insights";

const BAND_ORDER = ["1-2", "3-4", "5-6", "7-8"] as const;
const SHOWN_BULLETS = 6;

function AreasForImprovement({ bullets }: { bullets: AreaBullet[] }) {
  if (bullets.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Nothing yet — these come from approved reports, so they appear once a report has been
        approved.
      </p>
    );
  }
  // Every report adds four to six of these, so by mid-year the list is the
  // longest thing on the page and the newest bullets are at the bottom of it.
  // Most recent first, a handful shown, the rest one click away.
  const ordered = [...bullets].reverse();
  const shown = ordered.slice(0, SHOWN_BULLETS);
  const rest = ordered.slice(SHOWN_BULLETS);

  return (
    <>
      <ul className="space-y-2">
        {shown.map((b, i) => (
          <li key={i} className="text-sm text-slate-800">
            {b.text}
            <span className="ml-1 text-xs text-slate-500">— {b.assessmentTitle}</span>
          </li>
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            {rest.length} earlier
          </summary>
          <ul className="mt-2 space-y-2">
            {rest.map((b, i) => (
              <li key={i} className="text-sm text-slate-700">
                {b.text}
                <span className="ml-1 text-xs text-slate-500">— {b.assessmentTitle}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/**
 * Detail that belongs to particular tasks and units: useful when looking back at
 * a paper, not the picture of the year, so the student page keeps it folded
 * away below the sections that are.
 */
export function TaskDetail({
  bullets,
  recurrences,
  unattempted,
  mastery,
  studentId,
  studentName,
  pseudonym,
  initialInsights,
}: {
  bullets: AreaBullet[];
  recurrences: Recurrence[];
  unattempted: UnattemptedSignal;
  mastery: MasteryRow[];
  studentId: number;
  studentName: string;
  pseudonym: string;
  initialInsights: StudentInsights | null;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Learning targets weak on more than one task
        </h3>
        {recurrences.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {recurrences.map((r) => (
              <li key={r.text} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[15px] font-medium">{r.text}</p>
                  <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                    {r.occurrences} tasks
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">{r.detail}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-600">
            None yet. A target shows here once it has come up weak on two pieces of work.
          </p>
        )}
      </div>

      {unattempted.total > 0 && (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-800">
          <span className="font-medium">
            {unattempted.total} question{unattempted.total === 1 ? "" : "s"} left unattempted
          </span>
          {unattempted.total === 1
            ? "."
            : unattempted.concentratedInHardest
              ? " — most of them in the harder bands, which reads as pacing rather than not knowing."
              : " — spread across the bands."}{" "}
          <span className="text-slate-600">
            {BAND_ORDER.filter((b) => unattempted.byBand[b] > 0)
              .map((b) => `${unattempted.byBand[b]} in ${b}`)
              .join(", ")}
          </span>
        </p>
      )}

      {/* The one thing that can read the prose and find a theme across it. */}
      <AiDigestPanel
        studentId={studentId}
        studentName={studentName}
        pseudonym={pseudonym}
        initial={initialInsights}
      />

      <details className="rounded-lg border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-slate-600">
          Every point from the reports
          <span className="ml-2 font-normal normal-case tracking-normal text-slate-500">
            {bullets.length}
          </span>
        </summary>
        <div className="mt-3">
          <AreasForImprovement bullets={bullets} />
        </div>
      </details>

      <details className="rounded-lg border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-slate-600">
          Learning-target mastery
          <span className="ml-2 font-normal normal-case tracking-normal text-slate-500">
            {mastery.length} target{mastery.length === 1 ? "" : "s"}
          </span>
        </summary>
        <div className="mt-3">
          <MasteryList rows={mastery} />
        </div>
      </details>
    </div>
  );
}
