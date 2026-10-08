import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getClass,
  getConferenceSession,
  getStudent,
  listConferenceMeetings,
} from "@/lib/db/queries";
import { buildConferenceBrief } from "@/lib/students/conference";
import { Breadcrumb } from "@/app/_components/Breadcrumb";
import { ConferenceProfile } from "@/app/students/_components/ConferenceProfile";
import { computePotentialVsAttainment } from "@/lib/students/potential";
import { computeBackground } from "@/lib/students/background";
import { PrintButton } from "@/app/students/_components/PrintButton";

export const dynamic = "force-dynamic";

/** Today where the teacher is, as the ISO date the brief reckons "coming up" from. */
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

export default async function StudentConferencePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; view?: string; session?: string }>;
}) {
  const { id } = await params;
  const { from, view, session: sessionParam } = await searchParams;
  const studentId = Number(id);
  const student = Number.isInteger(studentId) ? getStudent(studentId) : undefined;
  if (!student) notFound();

  const date = /^\d{4}-\d{2}-\d{2}$/.test(from ?? "") ? (from as string) : todayIso();
  const brief = buildConferenceBrief(studentId, date);
  if (!brief) notFound();

  // Her own view is the default — this is a page she opens to prepare, and she
  // presses Parent view when she turns the screen round. The teacher-only data
  // is read only in that mode, so the parent view never has it to leak: not in
  // the markup, not in the flight payload, not in a saved page.
  const teacher = view !== "parent";

  // When this page was opened from an evening's running order, it walks that
  // order: the next meeting is a click away and the view mode travels with it,
  // so stepping forward mid-evening never lands on the teacher's view with the
  // screen turned round.
  const sessionId = Number(sessionParam);
  const session = Number.isInteger(sessionId) ? getConferenceSession(sessionId) : undefined;
  const meetings = session ? listConferenceMeetings(session.id) : [];
  const atIndex = meetings.findIndex((m) => m.student_id === studentId);
  const walk =
    atIndex >= 0
      ? {
          sessionId: session!.id,
          position: atIndex + 1,
          total: meetings.length,
          prev: meetings[atIndex - 1] ?? null,
          next: meetings[atIndex + 1] ?? null,
        }
      : null;

  const stepHref = (m: { student_id: number | null }) =>
    `/students/${m.student_id}/conference?from=${date}&view=${teacher ? "teacher" : "parent"}&session=${walk?.sessionId}`;

  // Previous semesters, MAP and CAT4 go to both views; she decided parents see
  // CAT4 beside MAP. MAP's "Anon Name" is the export's stand-in for the student,
  // not their name, and would only puzzle a parent.
  const background = computeBackground(studentId);
  const map = {
    measures: background.map,
    notes: background.mapNotes.filter((n) => !/^anon name$/i.test(n.label)),
  };

  return (
    <div>
      <div className="print:hidden">
        <Breadcrumb
          items={[
            { label: "Students", href: "/students" },
            { label: student.name, href: `/students/${studentId}` },
            { label: "Conference" },
          ]}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* The page's own header is the profile's; this strip is the tooling
              around it, and none of it prints. */}
          <form method="get" className="flex items-center gap-2 text-sm">
            {!teacher && <input type="hidden" name="view" value="parent" />}
            <label htmlFor="from" className="text-slate-600">
              Conference on
            </label>
            <input
              id="from"
              type="date"
              name="from"
              defaultValue={date}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium hover:bg-slate-50"
            >
              Update
            </button>
          </form>
          <div className="flex items-center gap-2">
            <PrintButton />
          </div>
        </div>
      </div>

      {walk && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm print:hidden">
          <span className="text-slate-600">
            Meeting {walk.position} of {walk.total}
            {walk.next?.at_time && (
              <span className="ml-2">
                · next at <span className="font-medium text-slate-900">{walk.next.at_time}</span>
              </span>
            )}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            {walk.prev?.student_id ? (
              <Link
                href={stepHref(walk.prev)}
                className="rounded-md border border-slate-300 px-3 py-1 font-medium hover:bg-white"
              >
                ← {walk.prev.raw_name}
              </Link>
            ) : (
              <span className="px-3 py-1 text-slate-400">← first</span>
            )}
            <Link
              href={`/students/conferences?session=${walk.sessionId}`}
              className="rounded-md border border-slate-300 px-3 py-1 font-medium hover:bg-white"
            >
              The evening
            </Link>
            {walk.next?.student_id ? (
              <Link
                href={stepHref(walk.next)}
                className="rounded-md bg-slate-900 px-3 py-1 font-semibold text-white hover:bg-slate-700"
              >
                {walk.next.raw_name} →
              </Link>
            ) : (
              <span className="px-3 py-1 text-slate-400">last →</span>
            )}
          </span>
        </div>
      )}

      <div className="mt-6">
        <ConferenceProfile
          brief={brief}
          cls={getClass(student.class_id)}
          from={date}
          teacher={teacher}
          priorYears={background.priorYears}
          map={map}
          cat4={background.cat4}
          potential={teacher ? computePotentialVsAttainment(studentId) : null}
        />
      </div>
    </div>
  );
}
