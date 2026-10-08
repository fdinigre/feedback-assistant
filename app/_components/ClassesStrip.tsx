import Link from "next/link";
import type { AssessmentProgressCard, ClassOverview, WeekEntry } from "@/lib/dashboard/data";

/** The five pipeline stages, in order, as [count key, label]. */
const STAGES = [
  ["toAssign", "to assign"],
  ["toTranscribe", "to transcribe"],
  ["toGrade", "to grade"],
  ["toReview", "to review"],
  ["reviewedCount", "reviewed"],
] as const;

export function ClassesStrip({
  classes,
  current,
  nextAssessed,
}: {
  classes: ClassOverview[];
  /** The assessment each class is standing on, where there is one. */
  current: Map<number, AssessmentProgressCard>;
  /** The next thing the year plan says assesses a criterion, per class. */
  nextAssessed: Map<number, WeekEntry>;
}) {
  if (classes.length === 0) {
    return <p className="text-sm text-slate-500">No classes yet.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {classes.map((c) => {
        const card = current.get(c.id);
        const next = nextAssessed.get(c.id);
        const done = card ? card.toAssign + card.toTranscribe + card.toGrade + card.toReview === 0 : false;
        return (
          <article key={c.id} className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-sans text-[17px] font-semibold">
                <Link href={`/classes/${c.id}`} className="hover:underline">
                  {c.name}
                </Link>
              </h3>
              <span className="text-sm text-slate-600">
                {c.studentCount} student{c.studentCount === 1 ? "" : "s"}
              </span>
            </div>

            {card ? (
              <>
                <p className="mt-1.5 text-sm text-slate-700">
                  <Link href={`/assessments/${card.id}/submissions`} className="hover:underline">
                    {card.title}
                  </Link>
                  {card.criteria.length > 0 && ` · Criteri${card.criteria.length === 1 ? "on" : "a"} ${card.criteria.join(" & ")}`}
                </p>
                <div className="mt-4 flex h-2 gap-0.5 overflow-hidden rounded bg-slate-100">
                  {STAGES.map(([key], i) => {
                    const count = card[key];
                    if (count === 0) return null;
                    return (
                      <div
                        key={key}
                        // Later stages read darker, so the bar fills towards done
                        // from left to right as the class moves through.
                        className="bg-blue-600"
                        style={{ flex: count, opacity: 0.3 + i * 0.175 }}
                      />
                    );
                  })}
                </div>
                <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
                  {STAGES.map(([key, label]) => {
                    const count = card[key];
                    if (count === 0) return null;
                    const waiting = key !== "reviewedCount";
                    // Work still waiting is a warning, so it opens the page that runs it.
                    return waiting ? (
                      <Link
                        key={key}
                        href={`/assessments/${card.id}/submissions`}
                        className="font-medium text-amber-700 underline decoration-amber-300 underline-offset-2 hover:text-amber-800"
                      >
                        {count} {label}
                      </Link>
                    ) : (
                      <span key={key}>
                        {count} {label}
                      </span>
                    );
                  })}
                  {card.absentCount > 0 && (
                    <span className="text-slate-500">{card.absentCount} absent</span>
                  )}
                </p>
                {done && next && (
                  <p className="mt-2 text-sm text-slate-600">
                    Next assessed: {next.topic} ·{" "}
                    {new Date(next.date + "T00:00:00Z").toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      timeZone: "UTC",
                    })}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1.5 text-sm text-slate-600">
                Nothing in progress.{" "}
                {/* Short of the full roster is a gap worth filling, so it links to the import. */}
                {c.mapCount < c.studentCount || c.cat4Count < c.studentCount ? (
                  <Link href={`/classes/${c.id}#import`} className="underline underline-offset-2">
                    MAP {c.mapCount}/{c.studentCount} · CAT4 {c.cat4Count}/{c.studentCount}
                  </Link>
                ) : (
                  <>
                    MAP {c.mapCount}/{c.studentCount} · CAT4 {c.cat4Count}/{c.studentCount}
                  </>
                )}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
