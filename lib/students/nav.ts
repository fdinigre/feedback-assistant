import "server-only";

import { listStudents } from "@/lib/db/queries";

export type StudentNav = {
  position: number | null;
  total: number;
  prevId: number | null;
  nextId: number | null;
};

/** Prev/next/position for the student profile page's nav bar, ordered by name (case-insensitive) within the same class. */
export function computeStudentNav(classId: number, currentStudentId: number): StudentNav {
  const students = [...listStudents(classId)].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
  const idx = students.findIndex((s) => s.id === currentStudentId);
  const total = students.length;
  const position = idx >= 0 ? idx + 1 : null;
  const prevId = idx > 0 ? students[idx - 1].id : null;
  const nextId = idx >= 0 && idx < total - 1 ? students[idx + 1].id : null;
  return { position, total, prevId, nextId };
}
