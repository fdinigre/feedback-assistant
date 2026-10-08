import "server-only";

import { listClasses, listStudents } from "@/lib/db/queries";
import { computeCriterionHistory } from "@/lib/students/criterion-history";

export type StudentIndexRow = {
  id: number;
  name: string;
  pseudonym: string;
  latestLevels: { criterion: string; level: number }[];
  /**
   * The latest DP grade or points score, e.g. "Grade 4" or "12/15". DP and
   * points-only work is not marked by criterion, so without this a DP class
   * reads as though nobody had been graded.
   */
  latestOther: string | null;
};

export type ClassGroup = {
  classId: number;
  className: string;
  students: StudentIndexRow[];
};

/** All students grouped by class, each with their latest graded levels or grade — feeds /students. */
export function listStudentsForIndex(): ClassGroup[] {
  return listClasses().map((cls) => ({
    classId: cls.id,
    className: cls.name,
    students: listStudents(cls.id).map((s) => {
      const history = computeCriterionHistory(s.id);
      const other = history.otherGrades[history.otherGrades.length - 1]?.grade;
      return {
        id: s.id,
        name: s.name,
        pseudonym: s.pseudonym,
        latestLevels: history.criteria.map((c) => ({
          criterion: c.criterion,
          level: c.points[c.points.length - 1].level,
        })),
        latestOther:
          other?.kind === "dp" ? `Grade ${other.grade}` : other?.kind === "points" ? other.label : null,
      };
    }),
  }));
}
