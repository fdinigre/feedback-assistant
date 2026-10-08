import "server-only";

import { listStudents } from "@/lib/db/queries";
import { computeSubmissionGrade, formatCompact } from "@/lib/students/grade-cell";
import { listGradedSubmissions } from "@/lib/students/shared";

export type GradebookCell = {
  submissionId: number;
  /** DP: the 1-7 grade; MYP: compact criterion levels e.g. "A4 C3". */
  display: string;
  /** DP only: the percentage, shown small under the grade. */
  sub?: string;
};
export type GradebookColumn = { assessmentId: number; title: string; programme: string };
export type GradebookRow = { studentId: number; name: string; cells: Record<number, GradebookCell> };
export type ClassGradebook = { columns: GradebookColumn[]; rows: GradebookRow[] };

/**
 * A student × assessment grade matrix for a whole class: DP assessments show the 1-7
 * grade (with %); MYP assessments show the achieved criterion levels. Columns are the
 * assessments any student in the class has been graded on, oldest first.
 */
export function computeClassGradebook(classId: number): ClassGradebook {
  const students = listStudents(classId);
  const columnMap = new Map<number, GradebookColumn & { sortKey: string }>();
  const rows: GradebookRow[] = [];

  for (const student of students) {
    const cells: Record<number, GradebookCell> = {};
    for (const { assessment, submission } of listGradedSubmissions(student.id)) {
      if (!columnMap.has(assessment.id)) {
        columnMap.set(assessment.id, {
          assessmentId: assessment.id,
          title: assessment.title,
          programme: assessment.programme,
          sortKey: assessment.date ?? assessment.created_at,
        });
      }

      const grade = computeSubmissionGrade(assessment, submission);
      const sub = grade.kind === "dp" ? `${grade.pct.toFixed(0)}%` : undefined;
      cells[assessment.id] = {
        submissionId: submission.id,
        display: formatCompact(grade),
        ...(sub ? { sub } : {}),
      };
    }
    rows.push({ studentId: student.id, name: student.name, cells });
  }

  const columns = [...columnMap.values()]
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map(({ sortKey: _sortKey, ...c }) => c);
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { columns, rows };
}
