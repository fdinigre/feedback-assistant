// Raw read against the submissions table (owned by the assessments/grading
// feature) so the roster feature can block removing a student who already
// has graded/ungraded work on file. Deliberately does not import from
// lib/db/queries.ts's assessment-side helpers to keep this feature's surface
// area limited to app/classes/** + lib/roster/**.

import "server-only";

import { getDb } from "@/lib/db";

/** True if the student has at least one row in `submissions`. */
export function studentHasSubmissions(studentId: number): boolean {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM submissions WHERE student_id = ?")
    .get(studentId) as { count: number };
  return row.count > 0;
}
