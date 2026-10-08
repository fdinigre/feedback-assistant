import Link from "next/link";
import {
  getClass,
  getConferenceSession,
  getStudent,
  listConferenceMeetings,
  listConferenceSessions,
} from "@/lib/db/queries";
import { Breadcrumb } from "@/app/_components/Breadcrumb";
import { ScheduleEditor } from "./_components/ScheduleEditor";
import { RunningOrder, type MeetingRow } from "./_components/RunningOrder";
import { NewSession } from "./_components/NewSession";
import { ScheduleUpload } from "./_components/ScheduleUpload";

export const dynamic = "force-dynamic";

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export default async function ConferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session: sessionParam } = await searchParams;
  const sessions = listConferenceSessions();
  const sessionId = Number(sessionParam);
  const session = Number.isInteger(sessionId)
    ? getConferenceSession(sessionId)
    : (sessions[0] ?? undefined);

  const meetings: MeetingRow[] = session
    ? listConferenceMeetings(session.id).map((m) => {
        const student = m.student_id ? getStudent(m.student_id) : undefined;
        return {
          id: m.id,
          studentId: student?.id ?? null,
          studentName: student?.name ?? null,
          className: student ? (getClass(student.class_id)?.name ?? null) : null,
          time: m.at_time,
          parentName: m.parent_name,
          rawName: m.raw_name,
          done: m.done === 1,
        };
      })
    : [];

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumb items={[{ label: "Students", href: "/students" }, { label: "Conferences" }]} />
        <h1 className="text-4xl font-semibold">Conference evenings</h1>
        <p className="mt-2 max-w-[66ch] text-[15px] text-slate-700">
          Paste an evening&rsquo;s schedule once and walk it. Each meeting opens that
          student&rsquo;s conference page in the parent view, and the page steps forward through
          this order so you never come back here mid-evening.
        </p>
      </div>

      {sessions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {sessions.map((s) => (
            <Link
              key={s.id}
              href={`/students/conferences?session=${s.id}`}
              className={
                s.id === session?.id
                  ? "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white"
                  : "rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
              }
            >
              {formatDay(s.date)}
              {s.label ? ` · ${s.label}` : ""}
            </Link>
          ))}
        </div>
      )}

      <ScheduleUpload />

      <NewSession defaultDate={todayIso()} />

      {session && (
        <>
          {meetings.length > 0 && (
            <RunningOrder sessionId={session.id} meetings={meetings} from={session.date} />
          )}
          <ScheduleEditor
            sessionId={session.id}
            initialText={meetings.map((m) => m.rawName).join("\n")}
          />
        </>
      )}
    </div>
  );
}
