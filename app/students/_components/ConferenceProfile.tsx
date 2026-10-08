import Link from "next/link";

import { BandTrack, LevelBars, bandLabelOf, type ChartBar } from "./LevelChart";
import { Cat4Card, MapCard, YearGrid, type YearCard } from "@/app/students/[id]/_components/Background";
import { isBeforeSemester } from "@/lib/students/semester";
import { CommonMistakesGrid } from "./CommonMistakes";
import { UnreviewedLinks } from "./UnreviewedLinks";
import type { Measure, PriorYear } from "@/lib/students/background";
import type { ConferenceBrief } from "@/lib/students/conference";
import type { PotentialVsAttainment } from "@/lib/students/potential";
import type { ClassRow, Criterion } from "@/lib/types";

/**
 * One student, laid out for the ten minutes you have with their parent.
 *
 * Two modes, and the switch is a link rather than client state on purpose: the
 * parent view is a different URL, so it survives a reload, prints as itself,
 * and — the part that matters — the teacher-only sections are never computed or
 * sent when it is the one being shown. Unreviewed levels and the internal data
 * are not things to hide with a CSS class on a screen that is
 * being turned around.
 */

const CRITERION_NAMES: Record<string, string> = {
  A: "Knowing and understanding",
  B: "Investigating patterns",
  C: "Communicating",
  D: "Applying mathematics in real-life contexts",
};

const MYP_CRITERIA: Criterion[] = ["A", "B", "C", "D"];

/** A band's place in the ladder; nothing reached sorts first. */
function bandIndex(band: string | null): number {
  return band ? ["1-2", "3-4", "5-6", "7-8"].indexOf(band) : -1;
}

function formatDay(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function formatLongDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "A", "A and B", "A, B and C" — the down branch below was printing "none". */
function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function SectionHeading({ title, lede }: { title: string; lede?: string }) {
  return (
    <>
      <h2 className="text-xl font-semibold">{title}</h2>
      {lede && <p className="mt-1 max-w-[62ch] text-sm text-slate-700">{lede}</p>}
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="block font-sans text-xs font-semibold uppercase tracking-wider text-slate-600">
      {children}
    </span>
  );
}

export function ConferenceProfile({
  brief,
  cls,
  from,
  teacher,
  priorYears,
  map,
  cat4,
  potential,
}: {
  brief: ConferenceBrief;
  cls: ClassRow | undefined;
  from: string;
  /** Her own view. The parent view is the same page with the extras withheld. */
  teacher: boolean;
  /** Earlier years and semesters as imported. Shown in both views. */
  priorYears: PriorYear[];
  /** MAP results as imported. Shown in both views. */
  map: { measures: Measure[]; notes: { label: string; value: string }[] };
  /** CAT4 results as imported, beside MAP. Shown in both views. */
  cat4: Measure[];
  potential: PotentialVsAttainment | null;
}) {
  const first = firstNameOf(brief.student.name);
  const isDp = cls?.programme === "DP";
  const assessedCount = brief.criteria.reduce((n, c) => n + c.points.length, 0) + brief.otherGrades.length;

  // The criterion with the most ground to make up carries the amber accent —
  // one place for the eye to go, rather than four cards all shouting.
  const weakest = [...brief.criteria].sort(
    (a, b) =>
      (a.points[a.points.length - 1]?.level ?? 9) - (b.points[b.points.length - 1]?.level ?? 9)
  )[0]?.criterion;

  const movedUp = brief.criteria.filter((c) => c.trend === "up");
  const movedDown = brief.criteria.filter((c) => c.trend === "down");
  const dpBars: ChartBar[] = [
    ...brief.priorFinalGrades.map((g) => ({
      label: g.fromMarking ? `${g.period} as marked here` : `${g.period} reported grade`,
      level: g.grade,
      past: true,
    })),
    ...brief.otherGrades.flatMap((g) =>
      g.grade.kind === "dp"
        ? [
            {
              label: `${g.assessmentTitle}${g.date ? `, ${formatDay(g.date)}` : ""}`,
              level: g.grade.grade,
            },
          ]
        : []
    ),
  ];
  // The headline is about this semester's work only; the bars before it are the
  // earlier semesters it is compared with.
  const latestDp = dpBars.filter((bar) => !bar.past).at(-1);

  // Everything before this semester: what the school reported, and — until its
  // report is imported — the previous semester as this app marked it.
  const imported = priorYears.filter((y) => isBeforeSemester(y.label, brief.semester));
  const usesMarking =
    brief.previousFromMarking !== null && !imported.some((y) => y.label === brief.previousSemester);
  const earlier: YearCard[] = usesMarking && brief.previousFromMarking ? [...imported, brief.previousFromMarking] : imported;
  const priorDp = brief.priorFinalGrades[brief.priorFinalGrades.length - 1];

  const headline =
    isDp && !latestDp
      ? `${first} has no graded work yet this semester.`
      : isDp && latestDp
      ? `${first} is at grade ${latestDp.level} on the most recent work${
          priorDp
            ? latestDp.level > priorDp.grade
              ? `, up from ${priorDp.grade} ${priorDp.fromMarking ? "at the end of" : "reported in"} ${priorDp.period}.`
              : latestDp.level < priorDp.grade
                ? `, down from ${priorDp.grade} ${priorDp.fromMarking ? "at the end of" : "reported in"} ${priorDp.period}.`
                : `, the same as ${priorDp.period}.`
            : "."
        }`
      : brief.criteria.length === 0
      ? `${first} has no criterion levels on file yet this semester.`
      : movedDown.length === 0 && movedUp.length > 0
        ? `${first} is at or above where they finished ${brief.priorPeriod} in every criterion assessed this semester.`
        : movedDown.length > 0
          ? movedUp.length === 0
            ? `${first} is below where they finished ${brief.priorPeriod} in ${listOf(movedDown.map((c) => c.criterion))}.`
            : `${first} has moved up in ${listOf(movedUp.map((c) => c.criterion))} and back in ${listOf(movedDown.map((c) => c.criterion))} since ${brief.priorPeriod}.`
          : `${first} has been assessed on ${listOf(brief.criteria.map((c) => c.criterion))} so far this semester.`;

  return (
    <div className="space-y-10">
      {/* The switch, and a note loud enough that nobody shares a screen without
          noticing which mode it is in. */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className={teacher ? "text-sm font-medium text-amber-700" : "text-sm text-slate-600"}>
          {teacher
            ? "Your view — unreviewed marks and your talking points are on screen"
            : "Parent view — everything on this page is safe to share"}
        </p>
        <div className="flex gap-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          <Link
            href={`?from=${from}&view=parent`}
            aria-current={!teacher ? "true" : undefined}
            className={
              !teacher
                ? "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white"
                : "rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:text-slate-900"
            }
          >
            Parent view
          </Link>
          <Link
            href={`?from=${from}`}
            aria-current={teacher ? "true" : undefined}
            className={
              teacher
                ? "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white"
                : "rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:text-slate-900"
            }
          >
            My view
          </Link>
        </div>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-6 border-b-2 border-slate-900 pb-5">
        <div>
          <Label>{brief.className}</Label>
          <h1 className="mt-1 text-4xl font-semibold">{brief.student.name}</h1>
        </div>
        <div className="text-right text-sm text-slate-600">
          <p>Conference · {formatLongDay(from)}</p>
          <p className="mt-1">
            {assessedCount === 0
              ? "No assessed work on file yet"
              : `${assessedCount} piece${assessedCount === 1 ? "" : "s"} of assessed work so far`}
          </p>
        </div>
      </header>

      {teacher && brief.settleFirst.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-6">
          <Label>
            <span className="text-amber-800">Settle before you sit down</span>
          </Label>
          <ul className="mt-3 space-y-2.5">
            {brief.settleFirst.map((item, i) => (
              <li key={i} className="text-sm leading-relaxed text-slate-800">
                {item.text}
                {item.href && (
                  <Link href={item.href} className="ml-2 font-medium text-blue-700 underline">
                    Open it
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {teacher && (
        <p className="max-w-[46ch] font-display text-2xl leading-snug">{headline}</p>
      )}

      {brief.criteria.length > 0 && (
        <section>
          <SectionHeading
            title="Where they are now"
            lede="Each criterion is judged on its own and marked out of 8. There is no single overall mark — a task assesses one or two criteria, never all four."
          />
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MYP_CRITERIA.map((criterion) => {
              const history = brief.criteria.find((c) => c.criterion === criterion);
              const upcoming = brief.comingUp.find((e) => e.criteria.includes(criterion));

              if (!history) {
                // Not every criterion comes round every term, and Criterion D in
                // particular is often a whole-unit task late in the year. Saying
                // when it is first assessed is more use than hiding the card.
                return (
                  <article
                    key={criterion}
                    className="break-inside-avoid rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5"
                  >
                    <Label>Criterion {criterion}</Label>
                    <p className="mt-0.5 text-base font-semibold">{CRITERION_NAMES[criterion]}</p>
                    <p className="mt-3 font-display text-xl text-slate-600">Not assessed yet</p>
                    {upcoming && (
                      <p className="mt-3 text-sm text-slate-700">
                        First assessed on {upcoming.topic}, {formatDay(upcoming.date)}.
                      </p>
                    )}
                  </article>
                );
              }

              const latest = history.points[history.points.length - 1];
              const prior = history.prior[history.prior.length - 1] ?? null;
              const isWeakest = criterion === weakest;

              return (
                <article
                  key={criterion}
                  className="break-inside-avoid rounded-lg border border-slate-200 bg-white p-5"
                >
                  <Label>Criterion {criterion}</Label>
                  <p className="mt-0.5 text-base font-semibold">{CRITERION_NAMES[criterion]}</p>
                  <div className="mt-3 flex items-baseline gap-2.5">
                    <span className="font-display text-5xl font-bold leading-none">
                      {latest.level}
                    </span>
                    {prior && (
                      <span
                        className={
                          latest.level > prior.level
                            ? "text-sm font-semibold text-blue-700"
                            : latest.level < prior.level
                              ? "text-sm font-semibold text-amber-700"
                              : "text-sm font-medium text-slate-600"
                        }
                      >
                        {latest.level > prior.level
                          ? `up from ${prior.level}`
                          : latest.level < prior.level
                            ? `down from ${prior.level}`
                            : `same as ${prior.level}`}
                      </span>
                    )}
                  </div>
                  <div className="mt-3.5">
                    <BandTrack
                      level={latest.level}
                      prior={prior?.level ?? null}
                      tone={isWeakest ? "amber" : "blue"}
                    />
                  </div>
                  <p
                    className={
                      isWeakest
                        ? "mt-2 text-xs font-medium text-amber-700"
                        : "mt-2 text-xs text-slate-600"
                    }
                  >
                    {isWeakest ? "Where the attention goes" : `In the ${bandLabelOf(latest.level)} band`}
                  </p>
                  {teacher && latest.provisional && (
                    <Link
                      href={`/submissions/${latest.submissionId}#criterion-${history.criterion}`}
                      className="mt-1 block text-xs text-amber-700 underline decoration-amber-300 underline-offset-2 hover:text-amber-800"
                      title={`Review ${latest.assessmentTitle}`}
                    >
                      Not yet reviewed
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {brief.criteria.some((c) => c.points.length > 0) && (
        <section>
          <SectionHeading
            title="How that has moved"
            lede={
              brief.priorPeriod
                ? `Every piece of assessed work this semester. The dashed line is where they finished ${brief.priorPeriod}.`
                : "Every piece of assessed work this semester."
            }
          />
          <div className="mt-5 grid gap-10 rounded-lg border border-slate-200 bg-white p-7 sm:grid-cols-2 lg:grid-cols-3">
            {brief.criteria.map((history) => {
              const bars: ChartBar[] = history.points.map((p) => ({
                label: `${p.assessmentTitle}${p.date ? `, ${formatDay(p.date)}` : ""}`,
                level: p.level,
                provisional: teacher && p.provisional,
              }));
              const prior = history.prior[history.prior.length - 1] ?? null;
              return (
                <div key={history.criterion} className="break-inside-avoid">
                  <p className="text-sm font-semibold">
                    Criterion {history.criterion} · {CRITERION_NAMES[history.criterion]}
                  </p>
                  <div className="mt-4">
                    <LevelBars
                      bars={bars}
                      prior={prior?.level ?? null}
                      priorLabel={prior?.period ?? "before"}
                    />
                  </div>
                  <div
                    className="mt-2 grid gap-1"
                    style={{ gridTemplateColumns: `repeat(${history.points.length}, minmax(0, 1fr))` }}
                  >
                    {history.points.map((p, i) => (
                      <div key={i} className="text-center">
                        <p className="text-sm font-semibold">{p.level}</p>
                        <p className="text-[11px] leading-tight text-slate-600">
                          {p.assessmentTitle}
                          <br />
                          {formatDay(p.date)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {isDp && dpBars.length > 0 && (
        <section>
          <SectionHeading
            title="The course so far"
            lede="The Diploma course runs across grades 11 and 12, so every earlier semester counts towards the same final grade. Grades are out of 7."
          />
          <div className="mt-5 break-inside-avoid rounded-lg border border-slate-200 bg-white p-7">
            <LevelBars max={7} bars={dpBars} />
            <div
              className="mt-2 grid gap-1"
              style={{ gridTemplateColumns: `repeat(${dpBars.length}, minmax(0, 1fr))` }}
            >
              {dpBars.map((bar, i) => (
                <div key={i} className="text-center">
                  <p className="text-sm font-semibold">{bar.level}</p>
                  <p className="text-[11px] leading-tight text-slate-600">{bar.label}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-slate-600">
              {brief.priorFinalGrades.length > 0
                ? "Dimmed bars to the left of the rule are earlier semesters; the rest is work sat this semester."
                : (
                  <>
                    Work sat this semester. No earlier grades have been imported for this student
                    {teacher && cls && (
                      <>
                        {" — "}
                        <Link href={`/classes/${cls.id}#import`} className="underline underline-offset-2">
                          import them on the class page
                        </Link>
                      </>
                    )}
                    .
                  </>
                )}
            </p>
          </div>
        </section>
      )}

      {earlier.length > 0 && (
        <section>
          <SectionHeading
            title="Before this semester"
            lede={
              usesMarking
                ? `How earlier semesters finished, as the school reported them, and ${brief.previousSemester} as marked here — no report for it has been imported yet.`
                : "How earlier semesters finished, as the school reported them."
            }
          />
          <div className="mt-5">
            <YearGrid years={earlier} />
          </div>
        </section>
      )}

      {(map.measures.length > 0 || cat4.length > 0) && (
        <section className="break-inside-avoid">
          <SectionHeading
            title={map.measures.length > 0 && cat4.length > 0 ? "MAP and CAT4" : map.measures.length > 0 ? "MAP" : "CAT4"}
            lede="The school's standardised tests, as the results were exported."
          />
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {map.measures.length > 0 && <MapCard measures={map.measures} notes={map.notes} />}
            {cat4.length > 0 && <Cat4Card measures={cat4} />}
          </div>
        </section>
      )}

      {brief.commonMistakes.length > 0 && (
        <section className="break-inside-avoid">
          <SectionHeading
            title="Most common mistakes"
            lede="The kinds of mistake that have come up most often in the marking, each on at least two questions."
          />
          <div className="mt-5">
            <CommonMistakesGrid mistakes={brief.commonMistakes} />
          </div>
        </section>
      )}

      {brief.strands.length > 0 && (
        <section className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
          <div>
            <SectionHeading
              title="What the work showed"
              lede="Strand by strand through the rubric, across every task marked against it: what they managed, in the task's own words, and what the next band asks for on any task."
            />
            <ul className="mt-5 space-y-5">
              {brief.strands.map((s) => (
                <li key={`${s.criterion}-${s.strand ?? s.name}`} className="break-inside-avoid">
                  <p className="text-[15px] font-semibold leading-snug">{s.name}</p>
                  <p className="text-xs text-slate-500">
                    Criterion {s.criterion}
                    {s.strand ? `, strand ${s.strand}` : ""} · {s.assessmentTitles.join(", ")}
                    {teacher && <UnreviewedLinks papers={s.unreviewed} criterion={s.criterion} />}
                  </p>
                  {s.reachedBand && (
                    <div className="mt-2 flex gap-3">
                      <span aria-hidden className="mt-0.5 shrink-0 font-semibold text-blue-700">
                        ✓
                      </span>
                      <span>
                        <span className="text-[15px] leading-snug">Reached band {s.reachedBand}</span>
                        {/* The task's own wording, as evidence of what they did —
                            it is a statement about the past, so one-off is fine. */}
                        {s.reached.map((r) => (
                          <span key={`${r.assessmentTitle}-${r.text}`} className="block text-sm text-slate-600">
                            {r.text}
                            {s.assessmentTitles.length > 1 && (
                              <span className="text-slate-400"> · {r.assessmentTitle}</span>
                            )}
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                  {/* The next band as the official descriptor, not the task's
                      wording of it: this is what the next task on the strand
                      will ask for, whatever it is about. */}
                  {s.nextBand && s.nextDescriptor && (
                    <div className="mt-2 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3.5">
                      <span aria-hidden className="mt-0.5 shrink-0 font-semibold text-amber-700">
                        →
                      </span>
                      <span>
                        <span className="text-[15px] leading-snug text-slate-800">{s.nextDescriptor}</span>
                        <span className="block text-xs text-slate-500">
                          {s.reachedBand ? "The next step up" : "Not yet"} · band {s.nextBand}
                        </span>
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* The strands with a next band, lowest reached first: named the way
              every task on the strand asks for them, so each one will come up
              again rather than being a sentence about a task already sat. */}
          {brief.strands.some((s) => s.nextDescriptor) && (
            <aside className="break-inside-avoid rounded-lg bg-slate-900 p-7 text-slate-100">
              <Label>
                <span className="text-slate-400">Next to aim for</span>
              </Label>
              <ul className="mt-4 space-y-3.5">
                {brief.strands
                  .filter((s) => s.nextDescriptor)
                  .sort((a, b) => bandIndex(a.reachedBand) - bandIndex(b.reachedBand))
                  .slice(0, 3)
                  .map((s) => (
                    <li key={`${s.criterion}-${s.strand ?? s.name}`} className="text-[15px] leading-relaxed">
                      {s.name}
                      <span className="mt-1 block text-sm text-slate-400">
                        Band {s.nextBand}: {s.nextDescriptor}
                      </span>
                    </li>
                  ))}
              </ul>
            </aside>
          )}
        </section>
      )}

      {teacher && (potential?.cat4 || potential?.map || brief.weakTargets.length > 0) && (
        <section className="grid gap-5 lg:grid-cols-2">
          {(potential?.cat4 || potential?.map) && (
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <Label>Potential against attainment</Label>
              <p className="mt-1 text-xs text-slate-500">Internal only — never on the parent view.</p>
              <dl className="mt-4 space-y-2 text-sm">
                {Object.entries(potential.cat4 ?? {}).map(([k, v]) => (
                  <div key={`cat4-${k}`} className="flex justify-between gap-4">
                    <dt className="text-slate-700">CAT4 {k}</dt>
                    <dd className="font-semibold">{v}</dd>
                  </div>
                ))}
                {Object.entries(potential.map ?? {}).map(([k, v]) => (
                  <div key={`map-${k}`} className="flex justify-between gap-4">
                    <dt className="text-slate-700">MAP {k}</dt>
                    <dd className="font-semibold">{v}</dd>
                  </div>
                ))}
                {potential.currentAveragePct !== null && (
                  <div className="flex justify-between gap-4 border-t border-slate-200 pt-2">
                    <dt className="text-slate-700">Marks so far this year</dt>
                    <dd className="font-semibold">{Math.round(potential.currentAveragePct)}%</dd>
                  </div>
                )}
              </dl>
              {potential.underperformanceNote && (
                <p className="mt-4 text-sm leading-relaxed text-slate-700">
                  Attainment sits below what the cognitive data suggests. Worth a sentence to the
                  parent in your own words — not these numbers.
                </p>
              )}
            </div>
          )}

          {brief.weakTargets.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <Label>Weakest skills on record</Label>
              <p className="mt-1 text-xs text-slate-500">
                Raw marks, so one bad question cannot read as a pattern.
              </p>
              <ul className="mt-4 space-y-3">
                {brief.weakTargets.map((t) => (
                  <li key={t.name}>
                    <div className="flex justify-between gap-3 text-sm">
                      <span>{t.name}</span>
                      <span className="whitespace-nowrap text-slate-600">
                        {t.earned} / {t.max}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {t.questionCount} question{t.questionCount === 1 ? "" : "s"} ·{" "}
                      {t.assessmentTitles.join(", ")}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {brief.weakTargets.length > 0 && (
        <section>
          {brief.recurringSkills.length > 0 ? (
            <SectionHeading
              title="Skills that keep coming back"
              lede="Each of these has been examined on more than one task already, so it is the skill and not the question — and there will be another chance at it."
            />
          ) : (
            <SectionHeading
              title="Where the marks are going missing"
              lede="Each of these has come up on one task so far, so it is a signal rather than a settled pattern. They move into the list above once they recur."
            />
          )}
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(brief.recurringSkills.length > 0 ? brief.recurringSkills : brief.weakTargets).map(
              (t) => (
                <article
                  key={t.name}
                  className="break-inside-avoid rounded-lg border border-slate-200 bg-white p-5"
                >
                  <p className="text-[15px] font-semibold leading-snug">{t.name}</p>
                  <p className="mt-2.5 text-sm text-slate-700">
                    {t.earned} of {t.max} marks across {t.questionCount} question
                    {t.questionCount === 1 ? "" : "s"}.
                  </p>
                  <div className="mt-3.5">
                    <Label>Examined on</Label>
                  </div>
                  <p className="mt-1 text-sm font-medium">{t.assessmentTitles.join(" · ")}</p>
                </article>
              )
            )}
          </div>
        </section>
      )}

      <section>
        <SectionHeading
          title="What is coming up"
          lede={`From the class plan, for the three weeks after ${formatLongDay(from)}.`}
        />
        {brief.comingUp.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            No year plan is loaded for {brief.className}, so there is nothing to show here.{" "}
            {teacher && cls ? (
              <Link href={`/classes/${cls.id}#year-plan`} className="underline underline-offset-2">
                Upload one on the class page
              </Link>
            ) : (
              "Upload one on the class page"
            )}{" "}
            and it fills in.
          </p>
        ) : (
          <div className="mt-5 flex flex-wrap border-t border-slate-200">
            {brief.comingUp.map((entry) => {
              const stands = entry.criteria
                .map((c) => {
                  const history = brief.criteria.find((h) => h.criterion === c);
                  const level = history?.points[history.points.length - 1]?.level;
                  return level == null ? `${c} · their first` : `${c} · now at ${level}`;
                })
                .join("  ");
              return (
                <div
                  key={entry.id}
                  className="flex-[1_1_15rem] break-inside-avoid border-b border-slate-200 px-5 py-4 first:pl-0"
                >
                  <p className="text-sm text-slate-600">{formatDay(entry.date)}</p>
                  <p
                    className={
                      entry.criteria.length > 0 ? "mt-1 font-semibold" : "mt-1 text-slate-800"
                    }
                  >
                    {entry.topic}
                  </p>
                  {entry.criteria.length > 0 && (
                    <p className="mt-2 inline-block rounded border border-blue-200 bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                      {stands}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
