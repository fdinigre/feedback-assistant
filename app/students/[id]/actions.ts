"use server";

import { revalidatePath } from "next/cache";
import {
  deleteExternalData,
  getClass,
  getStudent,
  listStudents,
  updateStudent,
  upsertExternalData,
} from "@/lib/db/queries";
import type { ExternalDataSource } from "@/lib/types";

const SOURCES: ExternalDataSource[] = ["MAP", "CAT4", "PRIOR_GRADES", "ATL"];

export type ProfileActionResult = { error: string | null };

/** Everything that shows a student's name or class, and so must be re-rendered. */
function revalidateStudent(studentId: number, classIds: number[]): void {
  revalidatePath(`/students/${studentId}`);
  revalidatePath(`/students/${studentId}/dossier`);
  revalidatePath("/students");
  for (const id of classIds) revalidatePath(`/classes/${id}`);
  revalidatePath("/classes");
  revalidatePath("/");
}

/**
 * Renames a student and/or moves them to another class. The pseudonym is not
 * editable: it is what the AI sees in place of the name, and a change would
 * orphan the pseudonymised text already stored for this student.
 */
export async function updateStudentProfileAction(
  studentId: number,
  input: { name: string; classId: number; modified: boolean }
): Promise<ProfileActionResult> {
  const student = getStudent(studentId);
  if (!student) return { error: "Student not found." };

  const name = input.name.trim();
  if (!name) return { error: "The name can't be empty." };
  if (name.length > 200) return { error: "That name is too long." };

  const cls = getClass(input.classId);
  if (!cls) return { error: "That class no longer exists." };

  // Two students with the same name in one class can't be told apart by a
  // marks sheet or a roster import, so refuse the collision.
  const clash = listStudents(cls.id).find(
    (s) => s.id !== studentId && s.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (clash) return { error: `${cls.name} already has a student called ${clash.name}.` };

  updateStudent(studentId, { name, class_id: cls.id, modified: input.modified });
  revalidateStudent(studentId, [student.class_id, cls.id]);
  return { error: null };
}

/**
 * Replaces one imported data set (MAP, CAT4, prior grades or ATL) with the
 * fields as edited. Keys and values are stored as typed; blank keys are
 * dropped, and an empty set removes the data set entirely.
 *
 * `period` names the record being edited, since prior grades keep one per
 * semester — without it, editing the latest semester would write a third,
 * undated record instead of correcting the one on screen.
 */
export async function saveExternalDataAction(
  studentId: number,
  source: ExternalDataSource,
  fields: { key: string; value: string }[],
  period: string | null = null
): Promise<ProfileActionResult> {
  const student = getStudent(studentId);
  if (!student) return { error: "Student not found." };
  if (!SOURCES.includes(source)) return { error: "Unknown data source." };

  const data: Record<string, string> = {};
  for (const { key, value } of fields) {
    const k = key.trim();
    if (!k) continue;
    if (k.length > 100 || value.length > 500) return { error: "A field is too long." };
    if (k in data) return { error: `"${k}" appears twice.` };
    data[k] = value.trim();
  }

  if (Object.keys(data).length === 0) deleteExternalData(studentId, source, period);
  else upsertExternalData({ student_id: studentId, source, data, period });

  revalidateStudent(studentId, [student.class_id]);
  return { error: null };
}

/** Removes the record on screen; `period` keeps a source's other records intact. */
export async function deleteExternalDataAction(
  studentId: number,
  source: ExternalDataSource,
  period: string | null = null
): Promise<ProfileActionResult> {
  const student = getStudent(studentId);
  if (!student) return { error: "Student not found." };
  if (!SOURCES.includes(source)) return { error: "Unknown data source." };
  deleteExternalData(studentId, source, period);
  revalidateStudent(studentId, [student.class_id]);
  return { error: null };
}
