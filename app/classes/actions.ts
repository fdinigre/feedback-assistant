"use server";

import { revalidatePath } from "next/cache";
import {
  deleteClassCascade,
  getClass,
  insertClass,
  updateClass,
} from "@/lib/db/queries";
import type { Course, Grade, Programme } from "@/lib/types";

export type ClassFormState = { error: string | null };

function parseProgramme(value: FormDataEntryValue | null): Programme {
  return value === "DP" ? "DP" : "MYP";
}

/**
 * MYP sets are grades 9 and 10; 11 and 12 are there for a course taught on the
 * MYP rubric in the senior years, such as Financial Math.
 */
function parseMypGrade(value: FormDataEntryValue | null): Grade | null {
  const n = Number(value);
  return n === 9 || n === 10 || n === 11 || n === 12 ? (n as Grade) : null;
}

function parseDpYear(value: FormDataEntryValue | null): 1 | 2 | null {
  const n = Number(value);
  return n === 1 || n === 2 ? (n as 1 | 2) : null;
}

/** The course in the teacher's own words, or none. */
function parseCourse(value: FormDataEntryValue | null): Course | null {
  const course = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  return course || null;
}

/**
 * Resolves (grade, programme, dp_year, course) from form input. DP classes pick
 * Year 1 / Year 2 rather than a grade — Year 1 is grade 11, Year 2 grade 12. The
 * course is free text for both programmes: a DP class may be AA or AI at SL or
 * HL, and an MYP class any set or course.
 */
function resolveClassFields(
  formData: FormData
):
  | { grade: Grade; programme: Programme; dp_year: 1 | 2 | null; course: Course | null }
  | { error: string } {
  const programme = parseProgramme(formData.get("programme"));
  const course = parseCourse(formData.get("course"));
  if (programme === "DP") {
    const dpYear = parseDpYear(formData.get("dp_year"));
    if (!dpYear) return { error: "Select Year 1 or Year 2 for a DP class." };
    return { grade: dpYear === 1 ? 11 : 12, programme: "DP", dp_year: dpYear, course };
  }
  const grade = parseMypGrade(formData.get("grade"));
  if (!grade) return { error: "Select the grade." };
  return { grade, programme: "MYP", dp_year: null, course };
}

export async function createClassAction(
  _prevState: ClassFormState,
  formData: FormData
): Promise<ClassFormState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Class name is required." };
  const fields = resolveClassFields(formData);
  if ("error" in fields) return { error: fields.error };

  insertClass({ name, ...fields });
  revalidatePath("/classes");
  return { error: null };
}

export async function updateClassAction(
  _prevState: ClassFormState,
  formData: FormData
): Promise<ClassFormState> {
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !getClass(id)) return { error: "Class not found." };
  if (!name) return { error: "Class name is required." };
  const fields = resolveClassFields(formData);
  if ("error" in fields) return { error: fields.error };

  updateClass(id, { name, ...fields });
  revalidatePath("/classes");
  return { error: null };
}

export async function deleteClassAction(
  _prevState: ClassFormState,
  formData: FormData
): Promise<ClassFormState> {
  const id = Number(formData.get("id"));
  const cls = getClass(id);
  if (!cls) return { error: "Class not found." };
  // Cascade: removes the roster and every submission/report/exploration under it.
  // The client confirmation spells out this loss before the action fires.
  deleteClassCascade(id);
  revalidatePath("/classes");
  revalidatePath("/");
  return { error: null };
}
