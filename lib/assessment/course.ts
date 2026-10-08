import type { AssessmentRow, ClassRow, QuestionRow, StudentRow } from "@/lib/types";

/**
 * A points test: scored as points out of a total, with no criterion level.
 * Any MYP class can set one. Stored as assessment_type "fm_test" because the
 * Financial Math course was the first to use it; the name is historical.
 */
export function isFmTest(assessment: Pick<AssessmentRow, "assessment_type">): boolean {
  return assessment.assessment_type === "fm_test";
}

/**
 * The questions a given student sits: every question, minus those marked for
 * the other variant. A modified student skips "standard only" questions; the
 * rest skip "modified only" ones.
 */
export function questionsForStudent<Q extends Pick<QuestionRow, "variant">>(
  questions: Q[],
  student: Pick<StudentRow, "modified"> | null | undefined
): Q[] {
  const skip = student?.modified ? "standard" : "modified";
  return questions.filter((q) => q.variant !== skip);
}

/**
 * What a class is, without its name: "AA HL Year 2 (Grade 12)",
 * "Financial Math (Grade 12)", "Grade 9". The course is the teacher's own
 * words — a DP class can be any of the maths courses and an MYP class any set.
 */
export function courseLabel(cls: Pick<ClassRow, "programme" | "course" | "dp_year" | "grade">): string {
  if (cls.programme === "DP") return `${dpCourseYear(cls)} (Grade ${cls.grade})`;
  return cls.course ? `${cls.course} (Grade ${cls.grade})` : `Grade ${cls.grade}`;
}

/** "AA HL Year 2" — a DP class's course and year, for the IA pages. */
export function dpCourseYear(cls: Pick<ClassRow, "course" | "dp_year">): string {
  return `${cls.course || "DP"} Year ${cls.dp_year}`;
}

/** How a class reads in headings and pickers. */
export function classLabel(cls: ClassRow): string {
  return `${cls.name} — ${courseLabel(cls)}`;
}
