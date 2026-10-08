import Link from "next/link";
import {
  getAssessmentProgressCards,
  getClassesOverview,
  getIaAttentionSummary,
  getNeedsAttentionItems,
  getNextAssessedByClass,
  getThisWeek,
  type AssessmentProgressCard,
} from "@/lib/dashboard/data";
import { listAssessments, listStyleExamples } from "@/lib/db/queries";
import { NeedsAttention } from "./_components/NeedsAttention";
import { StartHere } from "./_components/StartHere";
import { ClassesStrip } from "./_components/ClassesStrip";

export const dynamic = "force-dynamic";

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

function outstanding(card: AssessmentProgressCard): number {
  return card.toAssign + card.toTranscribe + card.toGrade + card.toReview;
}

/**
 * The assessment each class is standing on: whatever still has work outstanding,
 * and failing that the most recent one, so a class that is fully marked says so
 * rather than going blank.
 */
function currentByClass(cards: AssessmentProgressCard[]): Map<number, AssessmentProgressCard> {
  const byClass = new Map<number, AssessmentProgressCard>();
  for (const card of cards) {
    if (card.classId === null) continue;
    const held = byClass.get(card.classId);
    if (!held) {
      byClass.set(card.classId, card);
      continue;
    }
    // Outstanding work always wins; between two of a kind, the later date does.
    const better =
      outstanding(card) > 0 && outstanding(held) === 0
        ? true
        : outstanding(card) === 0 && outstanding(held) > 0
          ? false
          : (card.date ?? "") > (held.date ?? "");
    if (better) byClass.set(card.classId, card);
  }
  return byClass;
}

export default function DashboardPage() {
  const today = todayIso();
  const needsAttention = getNeedsAttentionItems();
  // Still read for the class cards below; the full list lives on /assessments.
  const assessmentCards = getAssessmentProgressCards();
  const classes = getClassesOverview();
  const iaAttention = getIaAttentionSummary();
  const week = getThisWeek(today);
  const nextAssessed = getNextAssessedByClass(today);

  const [y, m, d] = today.split("-").map(Number);
  const heading = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  const waiting = needsAttention.length + (iaAttention.lateCount > 0 ? 1 : 0);

  // A new copy has nothing for the rest of the page to report on yet.
  const assessmentCount = listAssessments().length;
  const settingUp = assessmentCount === 0;

  return (
    <div className="space-y-11">
      <div>
        <h1 className="text-4xl font-semibold">{heading}</h1>
        <p className="mt-2 text-[17px] text-slate-700">
          {settingUp
            ? "Welcome. Three steps get you to your first marked assessment."
            : waiting === 0
              ? "Nothing is waiting on you."
              : `${waiting} thing${waiting === 1 ? " is" : "s are"} waiting on you.`}
        </p>
      </div>

      {settingUp && (
        <StartHere
          classCount={classes.length}
          firstEmptyClassId={classes.find((c) => c.studentCount === 0)?.id ?? null}
          studentCount={classes.reduce((sum, c) => sum + c.studentCount, 0)}
          assessmentCount={assessmentCount}
          hasVoiceExamples={listStyleExamples("comment").length > 0}
        />
      )}

      <section className="space-y-3">
        {waiting === 0 ? (
          settingUp ? null : (
            <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-sm text-slate-600">
              Nothing is waiting on you.
            </p>
          )
        ) : (
          <NeedsAttention items={needsAttention} />
        )}

        {iaAttention.hasDpClass && iaAttention.lateCount > 0 && (
          <Link
            href="/ia"
            className="flex items-baseline justify-between gap-4 rounded-lg border border-amber-200 bg-white px-6 py-5 hover:border-amber-300"
          >
            <span className="text-[17px] font-medium leading-snug">
              {iaAttention.lateCount} student{iaAttention.lateCount === 1 ? " is" : "s are"} late on
              their next exploration milestone
            </span>
            <span className="shrink-0 text-slate-400">→</span>
          </Link>
        )}
      </section>

      {classes.length > 0 && (
        <section>
          <h2 className="text-2xl font-semibold">Where each class is</h2>
          <p className="mt-1 text-[15px] text-slate-700">
            The assessment you are in the middle of, and how far through it you are.
          </p>
          <div className="mt-5">
            <ClassesStrip
              classes={classes}
              current={currentByClass(assessmentCards)}
              nextAssessed={nextAssessed}
            />
          </div>
        </section>
      )}

      {week.length > 0 && (
        <section>
          <h2 className="text-2xl font-semibold">This week</h2>
          <p className="mt-1 text-[15px] text-slate-700">From the year plans you have loaded.</p>
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {week.map((entry) => {
              const [, , day] = entry.date.split("-").map(Number);
              const weekday = new Date(entry.date + "T00:00:00Z").toLocaleDateString("en-GB", {
                weekday: "short",
                timeZone: "UTC",
              });
              return (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-baseline gap-3 border-b border-slate-100 px-6 py-4 last:border-b-0"
                >
                  <span className="w-16 shrink-0 text-sm text-slate-600">
                    {weekday} {day}
                  </span>
                  <span
                    className={
                      entry.criteria.length > 0
                        ? "flex-[1_1_20rem] font-medium"
                        : "flex-[1_1_20rem] text-slate-800"
                    }
                  >
                    {entry.topic}
                  </span>
                  <span className="text-sm text-slate-600">{entry.className}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
