import Link from "next/link";
import {
  getClass,
  getStudent,
  hasSkillTags,
  listClasses,
  listExternalData,
} from "@/lib/db/queries";
import { computeMastery } from "@/lib/students/mastery";
import {
  computeAreasForImprovement,
  computeCommonMistakes,
  computeCoreSkills,
  computeRecurrences,
  computeUnattempted,
} from "@/lib/students/patterns";
import { computeStrandProgress } from "@/lib/students/strands";
import { listGradedSubmissions } from "@/lib/students/shared";
import { computePotentialVsAttainment } from "@/lib/students/potential";
import { computeBackground } from "@/lib/students/background";
import { computeCriterionHistory } from "@/lib/students/criterion-history";
import { computeNextSteps } from "@/lib/students/nextSteps";
import { computeStudentNav } from "@/lib/students/nav";
import { computeAtlHistory } from "@/lib/atl/history";
import { getCachedInsights } from "@/lib/students/insights";
import { Breadcrumb } from "@/app/_components/Breadcrumb";
import { BandTrack, bandLabelOf } from "@/app/students/_components/LevelChart";
import { CommonMistakesGrid } from "@/app/students/_components/CommonMistakes";
import { TaskDetail } from "./_components/TaskDetail";
import { StrandProgressList } from "./_components/StrandProgressList";
import { CoreSkillsPanel } from "./_components/CoreSkillsPanel";
import { BackgroundSection, YearGrid, type YearCard } from "./_components/Background";
import { AtlPanel } from "./_components/AtlPanel";
import { NextStepsChecklist } from "./_components/NextStepsChecklist";
import { EditProfile } from "./_components/EditProfile";

export const dynamic = "force-dynamic";

const CRITERION_NAMES: Record<string, string> = {
  A: "Knowing and understanding",
  B: "Investigating patterns",
  C: "Communicating",
  D: "Applying mathematics in real-life contexts",
};

function Section({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-2xl font-semibold">{title}</h2>
      {lede && <p className="mt-1 max-w-[62ch] text-[15px] text-slate-700">{lede}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
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

export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const studentId = Number(id);
  const student = getStudent(studentId);

  if (!student) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Student not found</h1>
        <p className="mt-2 text-slate-600">
          No student exists with id {id}. Check the roster in{" "}
          <Link href="/classes" className="underline underline-offset-2">
            Classes
          </Link>
          .
        </p>
      </div>
    );
  }

  const cls = getClass(student.class_id);
  const nav = cls ? computeStudentNav(cls.id, studentId) : null;
  const { criteria, otherGrades, priorPeriod } = computeCriterionHistory(studentId);
  const mastery = computeMastery(studentId);
  const areaBullets = computeAreasForImprovement(studentId, student);
  const recurrences = computeRecurrences(studentId);
  const unattempted = computeUnattempted(studentId);
  const strands = computeStrandProgress(studentId);
  const coreSkills = computeCoreSkills(studentId);
  const graded = listGradedSubmissions(studentId);
  const skillsScanned = graded.filter((g) => hasSkillTags(g.submission.id)).length;
  // Where "Sort the mistakes" still needs running for this student, so the
  // notice can link to the page that runs it.
  const unsortedTasks = graded
    .filter((g) => !hasSkillTags(g.submission.id))
    .map((g) => ({ assessmentId: g.assessment.id, title: g.assessment.title }));
  const latestGraded = graded[graded.length - 1] ?? null;
  const commonMistakes = computeCommonMistakes(studentId);
  const potential = computePotentialVsAttainment(studentId);
  const background = computeBackground(studentId);
  const atl = computeAtlHistory(studentId);
  const nextSteps = computeNextSteps(studentId, student);
  const cachedInsights = getCachedInsights(studentId);

  // A DP course runs over two years, and its grades are 1-7 per task rather than
  // a level per criterion: the semesters of Grade 11 as the school reported them,
  // then this year's work, each task opening the paper it came from.
  const isDp = cls?.programme === "DP";
  const dpThisYear: YearCard | null = (() => {
    const assessments = otherGrades.flatMap((g) =>
      g.grade.kind === "dp"
        ? [
            {
              label: g.assessmentTitle,
              grade: g.grade.grade,
              pct: Math.round(g.grade.pct),
              href: `/submissions/${g.submissionId}`,
            },
          ]
        : []
    );
    if (assessments.length === 0) return null;
    return {
      label: "This year",
      finalGrade: null,
      criteria: [],
      assessments,
      notes: cls ? [{ label: "Class", value: cls.name }] : [],
    };
  })();
  // Only the semesters graded task by task move up; an MYP year before them
  // (levels per criterion, out of 8) stays with the rest of the imported record.
  const dpPriorYears = isDp ? background.priorYears.filter((y) => y.criteria.length === 0) : [];
  const dpYears: YearCard[] = isDp ? [...dpPriorYears, ...(dpThisYear ? [dpThisYear] : [])] : [];

  const weakest = [...criteria].sort(
    (a, b) =>
      (a.points[a.points.length - 1]?.level ?? 9) - (b.points[b.points.length - 1]?.level ?? 9)
  )[0]?.criterion;

  return (
    <div className="space-y-10">
      <header>
        <Breadcrumb
          items={[
            { label: "Students", href: "/students" },
            ...(cls ? [{ label: cls.name, href: `/classes/${cls.id}` }] : []),
            { label: student.name },
          ]}
        />
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-slate-900 pb-5">
          <div>
            <p className="font-sans text-xs font-semibold uppercase tracking-wider text-slate-600">
              {cls?.name ?? "No class"} · {student.pseudonym}
            </p>
            <h1 className="mt-1 text-4xl font-semibold">{student.name}</h1>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              href={`/students/${studentId}/conference`}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Conference profile
            </Link>
            {nav && (
              <>
                <StudentNavLink href={nav.prevId ? `/students/${nav.prevId}` : undefined}>
                  ← Previous
                </StudentNavLink>
                {nav.position && nav.total > 0 && (
                  <span className="text-sm text-slate-500">
                    {nav.position} of {nav.total}
                  </span>
                )}
                <StudentNavLink href={nav.nextId ? `/students/${nav.nextId}` : undefined}>
                  Next →
                </StudentNavLink>
              </>
            )}
          </div>
        </div>
      </header>

      {dpYears.length > 0 && (
        <Section
          title="Where they are now"
          lede={
            dpPriorYears.length === 0
              ? "The work sat this year, out of 7."
              : dpThisYear
                ? "Each earlier semester as the school reported it, then the work sat this year, out of 7."
                : "Each earlier semester as the school reported it, out of 7. Nothing has been graded this year yet."
          }
        >
          <YearGrid years={dpYears} />
        </Section>
      )}

      {!isDp && criteria.length > 0 && (
        <Section
          title="Where they are now"
          lede={
            priorPeriod
              ? `Every criterion assessed so far, each out of 8. The tick under the track is where they finished ${priorPeriod}.`
              : "Every criterion assessed so far, each out of 8."
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {criteria.map((history) => {
              const latest = history.points[history.points.length - 1];
              const prior = history.prior[history.prior.length - 1] ?? null;
              const isWeakest = history.criterion === weakest;
              return (
                <article
                  key={history.criterion}
                  className="rounded-lg border border-slate-200 bg-white p-5"
                >
                  <p className="font-sans text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Criterion {history.criterion}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold">
                    {CRITERION_NAMES[history.criterion] ?? ""}
                  </p>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="font-display text-4xl font-bold leading-none">
                      {latest.level}
                    </span>
                    {latest.provisional && (
                      <Link
                        href={`/submissions/${latest.submissionId}#criterion-${history.criterion}`}
                        className="text-xs font-medium text-amber-700 underline decoration-amber-300 underline-offset-2 hover:text-amber-800"
                        title={`Review ${latest.assessmentTitle}`}
                      >
                        not reviewed
                      </Link>
                    )}
                  </div>
                  <div className="mt-3">
                    <BandTrack
                      level={latest.level}
                      prior={prior?.level ?? null}
                      tone={isWeakest ? "amber" : "blue"}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    {bandLabelOf(latest.level)} band · {history.points.length} task
                    {history.points.length === 1 ? "" : "s"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    <Link
                      href={`/submissions/${latest.submissionId}`}
                      className="underline decoration-slate-300 underline-offset-2 hover:text-slate-800 hover:decoration-slate-500"
                    >
                      {latest.assessmentTitle}
                    </Link>
                    {latest.date ? `, ${formatDay(latest.date)}` : ""}
                  </p>
                </article>
              );
            })}
          </div>
          {otherGrades.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-700">
              {otherGrades.map((g, i) => (
                <li key={i}>
                  <Link
                    href={`/submissions/${g.submissionId}`}
                    className="font-medium underline decoration-slate-300 underline-offset-2 hover:decoration-slate-500"
                  >
                    {g.assessmentTitle}
                  </Link>{" "}
                  <span className="text-slate-600">
                    {g.grade.kind === "dp"
                      ? `grade ${g.grade.grade}`
                      : g.grade.kind === "points"
                        ? g.grade.label
                        : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* What follows is the year, not any one task: things that recur from
          unit to unit. Detail that belongs to one paper is folded away below. */}
      {strands.length > 0 && (
        <Section
          title="Strand by strand"
          lede="Each rubric strand across every task marked against it. The next band is the official descriptor, which any later task on the strand will ask for, whatever it is about."
        >
          <StrandProgressList strands={strands} />
        </Section>
      )}

      <Section
        title="Core skills across units"
        lede="The skills underneath every unit, where they have cost marks. One on more than one task is a habit to work on all year, not a bad day."
      >
        <CoreSkillsPanel
          skills={coreSkills}
          scanned={skillsScanned}
          graded={graded.length}
          unsorted={unsortedTasks}
        />
      </Section>

      {commonMistakes.length > 0 && (
        <Section
          title="Most common mistakes"
          lede="The kinds of mistake that come up most in the marking, each on at least two questions."
        >
          <CommonMistakesGrid mistakes={commonMistakes} showQuotes />
        </Section>
      )}

      <Section
        title="Approaches to learning"
        lede="One skill per approved report, against the school's Self-Direction scale. Research and Social are not on here because a marked paper cannot show them."
      >
        <AtlPanel standings={atl} />
      </Section>

      <Section title="Next steps">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          {nextSteps ? (
            <>
              <p className="mb-2 text-xs text-slate-500">
                From the most recent approved report: {nextSteps.assessmentTitle}
              </p>
              <NextStepsChecklist steps={nextSteps.steps} />
            </>
          ) : (
            <p className="text-sm text-slate-500">
              No approved report yet — actionable steps appear here once one is approved
              {latestGraded ? (
                <>
                  , starting with{" "}
                  <Link
                    href={`/submissions/${latestGraded.submission.id}#report`}
                    className="underline underline-offset-2"
                  >
                    the report for {latestGraded.assessment.title}
                  </Link>
                  .
                </>
              ) : (
                "."
              )}
            </p>
          )}
        </div>
      </Section>

      {/* Belongs to particular tasks and units, so it starts shut: the place
          to look back at a paper, not the picture of the year. */}
      <details className="rounded-lg border border-slate-200 bg-white p-5">
        <summary className="cursor-pointer text-2xl font-semibold">
          <span className="font-display">Detail from individual tasks</span>
          <span className="ml-2 align-middle text-sm font-normal text-slate-600">
            learning targets, the AI digest, every point from the reports
          </span>
        </summary>
        <div className="mt-4">
          <TaskDetail
            bullets={areaBullets}
            recurrences={recurrences}
            unattempted={unattempted}
            mastery={mastery}
            studentId={studentId}
            studentName={student.name}
            pseudonym={student.pseudonym}
            initialInsights={cachedInsights}
          />
        </div>
      </details>

      <Section
        title="Everything else on file"
        lede="Previous years, MAP and CAT4 as they were imported. Nothing here was produced by this app."
      >
        <BackgroundSection
          background={{
            ...background,
            priorYears: background.priorYears.filter((y) => !dpPriorYears.includes(y)),
          }}
          currentAttainmentPct={potential.currentAveragePct}
          priorYearsShownAbove={dpPriorYears.length > 0}
          classId={cls?.id ?? null}
        />
        {potential.underperformanceNote && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-slate-800">
            Attainment sits below what the cognitive data suggests.
          </p>
        )}
      </Section>

      <details className="rounded-lg border border-slate-200 bg-white p-5">
        <summary className="cursor-pointer text-2xl font-semibold">
          <span className="font-display">Advanced</span>
          <span className="ml-2 align-middle text-sm font-normal text-slate-600">the dossier</span>
        </summary>
        <div className="mt-4">
          <p className="text-sm text-slate-600">
            The dossier is every approved report for {student.name}, oldest first, as written —
            for keeping a record or handing on, not for reading at a meeting.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link
              href={`/students/${studentId}/dossier`}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Open dossier
            </Link>
            <a
              href={`/api/export/dossier/${studentId}`}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Download as Markdown
            </a>
          </div>
        </div>
      </details>

      <details className="rounded-lg border border-slate-200 bg-white p-5">
        <summary className="cursor-pointer text-2xl font-semibold">
          <span className="font-display">Edit profile and imported data</span>
        </summary>
        <div className="mt-4">
          <EditProfile
            student={student}
            classes={listClasses()}
            external={listExternalData(studentId).map((e) => ({
              source: e.source,
              period: e.period,
              data: e.data,
            }))}
          />
        </div>
      </details>
    </div>
  );
}

/** Prev/Next control for cycling classmates — disabled (no wrap-around) at either end of the roster. */
function StudentNavLink({ href, children }: { href?: string | null; children: React.ReactNode }) {
  if (!href) {
    return (
      <span className="cursor-not-allowed rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-300">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
    >
      {children}
    </Link>
  );
}
