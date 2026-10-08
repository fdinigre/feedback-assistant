import { UnreviewedLinks } from "@/app/students/_components/UnreviewedLinks";
import type { StrandProgress } from "@/lib/students/strands";
import type { LevelBand } from "@/lib/types";

const BANDS: LevelBand[] = ["1-2", "3-4", "5-6", "7-8"];

/** Four rungs: filled up to the band reached, the next one outlined. */
function BandSteps({ reached, next }: { reached: LevelBand | null; next: LevelBand | null }) {
  const reachedIndex = reached ? BANDS.indexOf(reached) : -1;
  return (
    <div className="flex gap-1" aria-hidden>
      {BANDS.map((band, i) => (
        <span
          key={band}
          className={`h-2 flex-1 rounded-sm ${
            i <= reachedIndex
              ? "bg-blue-600"
              : band === next
                ? "border border-amber-500 bg-amber-50"
                : "border border-slate-200 bg-white"
          }`}
        />
      ))}
    </div>
  );
}

/**
 * Each rubric strand across the year. The next band is the official descriptor
 * rather than one task's wording of it, because it is what every later task on
 * the strand will ask for.
 */
export function StrandProgressList({ strands }: { strands: StrandProgress[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {strands.map((s) => (
        <article
          key={`${s.criterion}-${s.strand ?? s.name}`}
          className="rounded-lg border border-slate-200 bg-white p-5"
        >
          <p className="font-sans text-xs font-semibold uppercase tracking-wider text-slate-600">
            Criterion {s.criterion}
            {s.strand ? ` · strand ${s.strand}` : ""}
          </p>
          <p className="mt-0.5 text-sm font-semibold">{s.name}</p>
          <div className="mt-3">
            <BandSteps reached={s.reachedBand} next={s.nextBand} />
          </div>
          <p className="mt-2 text-xs text-slate-600">
            {s.reachedBand ? `Reached ${s.reachedBand}` : "Not reached a band yet"}
            {s.nextBand ? ` · next ${s.nextBand}` : ""}
            <UnreviewedLinks papers={s.unreviewed} criterion={s.criterion} />
          </p>
          {s.nextDescriptor && <p className="mt-2 text-sm text-slate-800">{s.nextDescriptor}</p>}
          <p className="mt-2 text-xs text-slate-500">
            {s.assessmentTitles.length} task{s.assessmentTitles.length === 1 ? "" : "s"}:{" "}
            {s.assessmentTitles.join(", ")}
          </p>
        </article>
      ))}
    </div>
  );
}
