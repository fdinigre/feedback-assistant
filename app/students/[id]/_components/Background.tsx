import Link from "next/link";

import { BandTrack } from "@/app/students/_components/LevelChart";
import type { Background, Measure } from "@/lib/students/background";

/** The widest strand score on this roster is ±37, so ±40 holds every real value. */
const DELTA_SCALE = 40;

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5">
      <p className="font-sans text-xs font-semibold uppercase tracking-wider text-slate-600">
        {title}
      </p>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
      <div className="mt-4">{children}</div>
    </article>
  );
}

function Bar({ label, value, pct, tone = "blue" }: { label: string; value: string; pct: number; tone?: "blue" | "amber" }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-slate-700">{label}</span>
        <span className="font-semibold tabular-nums">{value}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={tone === "amber" ? "h-full bg-amber-500" : "h-full bg-blue-600"}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

/** Signed values either side of a centre line — the only honest shape for them. */
function Diverging({ label, value }: { label: string; value: number }) {
  const width = (Math.min(Math.abs(value), DELTA_SCALE) / DELTA_SCALE) * 50;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-slate-700">{label}</span>
        <span className="font-semibold tabular-nums">
          {value > 0 ? `+${value}` : value}
        </span>
      </div>
      <div className="relative mt-1 h-2 rounded-full bg-slate-100">
        <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />
        <div
          className={`absolute inset-y-0 rounded-full ${value < 0 ? "bg-amber-500" : "bg-blue-600"}`}
          style={
            value < 0
              ? { right: "50%", width: `${width}%` }
              : { left: "50%", width: `${width}%` }
          }
        />
      </div>
    </div>
  );
}

function MeasureRow({ measure }: { measure: Measure }) {
  switch (measure.kind) {
    case "percentile":
      return <Bar label={measure.label} value={`${measure.value}th`} pct={measure.value} />;
    case "score": {
      const [lo, hi] = measure.scale;
      return (
        <Bar
          label={measure.label}
          value={String(measure.value)}
          pct={((measure.value - lo) / (hi - lo)) * 100}
        />
      );
    }
    case "level":
      return (
        <div>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-slate-700">{measure.label}</span>
            <span className="font-semibold tabular-nums">
              {measure.value}
              <span className="font-normal text-slate-500"> / {measure.max}</span>
            </span>
          </div>
          <div className="mt-1.5">
            <BandTrack level={measure.value} max={measure.max} />
          </div>
        </div>
      );
    case "delta":
      return <Diverging label={measure.label} value={measure.value} />;
    case "text":
      return (
        <p className="text-sm">
          <span className="text-slate-600">{measure.label}: </span>
          {measure.value}
        </p>
      );
  }
}

export function BackgroundSection({
  background,
  currentAttainmentPct,
  priorYearsShownAbove = false,
  classId,
}: {
  background: Background;
  currentAttainmentPct: number | null;
  /** Some previous years lead the page instead (a DP student's Grade 11) and were taken out of `background`. */
  priorYearsShownAbove?: boolean;
  /** The student's class, whose page is where all of this is imported. */
  classId: number | null;
}) {
  const { priorYears, map, cat4, mapNotes } = background;
  const nothing =
    priorYears.length === 0 && map.length === 0 && cat4.length === 0 && currentAttainmentPct == null;

  if (nothing) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
        {priorYearsShownAbove
          ? "Nothing else imported for this student. Their previous years are under Where they are now; MAP and CAT4 are loaded from "
          : "Nothing imported for this student yet. Prior-year grades, MAP and CAT4 are loaded from "}
        {classId ? (
          <Link href={`/classes/${classId}#import`} className="underline underline-offset-2">
            the class page
          </Link>
        ) : (
          "the class page"
        )}
        .
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {priorYears.length > 0 && <YearGrid years={priorYears} />}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {map.length > 0 && <MapCard measures={map} notes={mapNotes} />}

        {cat4.length > 0 && (
          <Card title="CAT4">
            <div className="space-y-3">
              {cat4.map((m) => (
                <MeasureRow key={m.label} measure={m} />
              ))}
            </div>
          </Card>
        )}

        {currentAttainmentPct != null && (
          <Card title="This year so far" note="Total points earned across everything graded">
            <p className="font-display text-4xl font-bold leading-none">
              {Math.round(currentAttainmentPct)}%
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-blue-600"
                style={{ width: `${Math.min(100, Math.max(0, currentAttainmentPct))}%` }}
              />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/** The MAP results as one card. Shared with the conference page, which shows it to a parent. */
export function MapCard({
  measures,
  notes,
}: {
  measures: Measure[];
  notes: { label: string; value: string }[];
}) {
  return (
    <Card title="MAP" note={notes.length > 0 ? notes.map((n) => n.value).join(" · ") : undefined}>
      <div className="space-y-3">
        {measures.map((m) => (
          <MeasureRow key={m.label} measure={m} />
        ))}
      </div>
      {measures.some((m) => m.kind === "delta") && (
        <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
          Strand figures as the export gave them, either side of zero.
        </p>
      )}
    </Card>
  );
}

/** The CAT4 results as one card, beside MAP on the conference page. */
export function Cat4Card({ measures }: { measures: Measure[] }) {
  return (
    <Card title="CAT4">
      <div className="space-y-3">
        {measures.map((m) => (
          <MeasureRow key={m.label} measure={m} />
        ))}
      </div>
    </Card>
  );
}

/** One card's worth: an imported semester, or on a DP student's page, this year's work. */
export type YearCard = {
  label: string;
  finalGrade: number | null;
  criteria: { criterion: string; level: number }[];
  /** `href` when the assessment was sat in this app and has a submission to open. */
  assessments: { label: string; grade: number; pct: number | null; href?: string }[];
  notes: { label: string; value: string }[];
};

/** Years, or semesters, as cards: shared by the student page and the conference page. */
export function YearGrid({ years }: { years: YearCard[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {years.map((year) => (
        <article
          key={year.label}
          className="break-inside-avoid rounded-lg border border-slate-200 bg-white p-5"
        >
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-sans text-xs font-semibold uppercase tracking-wider text-slate-600">
              {year.label}
            </p>
            {year.finalGrade != null && (
              <p className="font-display text-3xl font-bold leading-none">
                {year.finalGrade}
                <span className="ml-1 align-middle text-xs font-normal text-slate-500">final</span>
              </p>
            )}
          </div>

          {year.criteria.length > 0 && (
            <ul className="mt-4 space-y-2.5">
              {year.criteria.map((c) => (
                <li key={c.criterion}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-slate-700">Criterion {c.criterion}</span>
                    <span className="font-semibold tabular-nums">{c.level}</span>
                  </div>
                  <div className="mt-1">
                    <BandTrack level={c.level} />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {year.assessments.length > 0 && (
            <ul className="mt-4 space-y-2">
              {year.assessments.map((a, i) => (
                <li key={i}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    {a.href ? (
                      <Link
                        href={a.href}
                        className="text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900 hover:decoration-slate-500"
                      >
                        {a.label}
                      </Link>
                    ) : (
                      <span className="text-slate-700">{a.label}</span>
                    )}
                    <span className="font-semibold tabular-nums">
                      {a.grade}
                      {a.pct != null && (
                        <span className="ml-1 font-normal text-slate-500">{a.pct}%</span>
                      )}
                    </span>
                  </div>
                  {a.pct != null && (
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-blue-600"
                        style={{ width: `${Math.min(100, a.pct)}%` }}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {year.notes.length > 0 && (
            <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
              {year.notes.map((n) => n.value).join(" · ")}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
