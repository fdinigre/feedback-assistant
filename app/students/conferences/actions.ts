"use server";

import { revalidatePath } from "next/cache";
import {
  addStudentAlias,
  deleteStudentAlias,
  listStudentAliases,
  listConferenceSessions,
  createConferenceSession,
  deleteConferenceSession,
  replaceConferenceMeetings,
  setConferenceMeetingDone,
} from "@/lib/db/queries";
import { matchNames, loadRoster, type RosterEntry } from "@/lib/conference/match";
import { parseSchedule, type ScheduleLine } from "@/lib/conference/schedule";
import { parseSchedulePdf } from "@/lib/conference/schedule-pdf";
import { extractPdfPageTexts } from "@/lib/assessment/extract-text";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Every name a student might be written under: the roster's, plus any alias
 * already recorded. The schedule and the roster disagree often enough — a
 * nickname, a different first name, a middle name dropped — that the aliases
 * are what stop her re-answering the same question every term.
 */
function nameIndex(): { names: string[]; byName: Map<string, RosterEntry> } {
  const roster = loadRoster();
  const byId = new Map(roster.map((r) => [r.student.id, r]));
  const byName = new Map<string, RosterEntry>();
  for (const entry of roster) byName.set(entry.student.name, entry);
  for (const alias of listStudentAliases()) {
    const entry = byId.get(alias.student_id);
    if (entry) byName.set(alias.alias, entry);
  }
  return { names: [...byName.keys()], byName };
}

export type PreviewRow = {
  time: string | null;
  raw: string;
  parentName: string | null;
  /** The roster match, or why there isn't one. */
  studentId: number | null;
  studentName: string | null;
  className: string | null;
  status: "matched" | "ambiguous" | "unmatched";
  candidates: { id: number; name: string; className: string }[];
};

/**
 * What the pasted schedule resolves to, without saving any of it. An uncertain
 * match stays uncertain here — five first names repeat on this roster, so
 * picking one would put the wrong child's grades in front of a parent.
 */
export async function previewScheduleAction(text: string): Promise<PreviewRow[]> {
  const lines: ScheduleLine[] = parseSchedule(text);
  const matches = matchNames(lines.map((l) => l.studentName));

  return lines.map((line, i) => {
    const match = matches[i];
    if (match?.kind === "matched") {
      return {
        time: line.time,
        raw: line.raw,
        parentName: line.parentName,
        studentId: match.entry.student.id,
        studentName: match.entry.student.name,
        className: match.entry.className,
        status: "matched",
        candidates: [],
      };
    }
    const candidates =
      match?.kind === "ambiguous" ? match.candidates : (match?.suggestions ?? []);
    return {
      time: line.time,
      raw: line.raw,
      parentName: line.parentName,
      studentId: null,
      studentName: null,
      className: null,
      status: match?.kind === "ambiguous" ? "ambiguous" : "unmatched",
      candidates: candidates.map((c) => ({
        id: c.student.id,
        name: c.student.name,
        className: c.className,
      })),
    };
  });
}

export async function createSessionAction(date: string, label: string): Promise<number> {
  const session = createConferenceSession(date, label.trim() || null);
  revalidatePath("/students/conferences");
  return session.id;
}

export async function saveScheduleAction(
  sessionId: number,
  rows: { studentId: number | null; time: string | null; parentName: string | null; raw: string }[]
): Promise<void> {
  replaceConferenceMeetings(
    sessionId,
    rows.map((r) => ({
      student_id: r.studentId,
      at_time: r.time,
      parent_name: r.parentName,
      raw_name: r.raw,
    }))
  );
  revalidatePath("/students/conferences");
}

export async function toggleMeetingDoneAction(meetingId: number, done: boolean): Promise<void> {
  setConferenceMeetingDone(meetingId, done);
  revalidatePath("/students/conferences");
}

export async function deleteSessionAction(sessionId: number): Promise<void> {
  deleteConferenceSession(sessionId);
  revalidatePath("/students/conferences");
}


export type ScheduleDay = { date: string; rows: PreviewRow[] };

/**
 * Reads the booking system's printed schedule. One PDF covers more than one
 * evening — hers carries two — so it comes back grouped by date and each date
 * becomes its own evening to walk.
 *
 * Parsed on this machine, not by a model: the layout is regular enough that a
 * parser is both exact and instant, and it keeps a list of student and parent
 * names off the network for a job that does not need it.
 */
export async function uploadScheduleAction(base64: string): Promise<{
  error: string | null;
  days?: ScheduleDay[];
}> {
  const file = path.join(os.tmpdir(), `ptc-${Date.now()}.pdf`);
  try {
    fs.writeFileSync(file, Buffer.from(base64, "base64"));
    const { names, byName } = nameIndex();
    const slots = parseSchedulePdf(extractPdfPageTexts(file), names);
    if (slots.length === 0) {
      return {
        error:
          "No meetings were found in that PDF. It should be the booking system's print view, with a date, a time range and a student on each row.",
      };
    }

    const byDate = new Map<string, PreviewRow[]>();
    for (const slot of slots) {
      const entry = slot.rosterName ? byName.get(slot.rosterName) : undefined;
      const rows = byDate.get(slot.date) ?? [];
      rows.push({
        time: slot.time,
        raw: slot.raw,
        parentName: slot.parentName,
        studentId: entry?.student.id ?? null,
        // What the schedule calls them, which is fuller than the roster where
        // the roster holds a first name only.
        studentName: entry ? (slot.studentName ?? entry.student.name) : null,
        className: entry?.className ?? null,
        status: entry ? "matched" : "unmatched",
        candidates: [],
      });
      byDate.set(slot.date, rows);
    }

    return {
      error: null,
      days: [...byDate.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, rows]) => ({ date, rows })),
    };
  } catch (err) {
    return { error: (err as Error).message || "That PDF could not be read." };
  } finally {
    fs.rmSync(file, { force: true });
  }
}

/** Saves every evening in one go, replacing any session already on that date. */
export async function saveScheduleDaysAction(days: ScheduleDay[]): Promise<number | null> {
  const existing = new Map(listConferenceSessions().map((s) => [s.date, s]));
  let first: number | null = null;
  for (const day of days) {
    const session = existing.get(day.date) ?? createConferenceSession(day.date, null);
    replaceConferenceMeetings(
      session.id,
      day.rows.map((r) => ({
        student_id: r.studentId,
        at_time: r.time,
        parent_name: r.parentName,
        raw_name: r.studentName ?? r.raw,
      }))
    );
    if (first === null) first = session.id;
  }
  revalidatePath("/students/conferences");
  return first;
}


export type RosterOption = { id: number; name: string; className: string };

/** Everyone, for the picker on a line that matched nobody. */
export async function rosterOptionsAction(): Promise<RosterOption[]> {
  return loadRoster()
    .map((r) => ({ id: r.student.id, name: r.student.name, className: r.className }))
    .sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
}

/**
 * Records that a schedule writes this student under another name, so the next
 * upload matches them without asking again. The alias is the name as written —
 * stored verbatim, because that is what the next file will say too.
 */
export async function assignAliasAction(
  studentId: number,
  alias: string,
  source = "conference schedule"
): Promise<void> {
  addStudentAlias(studentId, alias, source);
  revalidatePath("/students/conferences");
}

export async function removeAliasAction(id: number): Promise<void> {
  deleteStudentAlias(id);
  revalidatePath("/students/conferences");
}

export type AliasRow = { id: number; alias: string; studentName: string };

export async function listAliasesAction(): Promise<AliasRow[]> {
  const roster = new Map(loadRoster().map((r) => [r.student.id, r.student.name]));
  return listStudentAliases().map((a) => ({
    id: a.id,
    alias: a.alias,
    studentName: roster.get(a.student_id) ?? `Student ${a.student_id}`,
  }));
}
