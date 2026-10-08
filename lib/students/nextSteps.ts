import "server-only";

import { getReport } from "@/lib/db/queries";
import { injectNameSections } from "@/lib/render/names";
import { listGradedSubmissions } from "@/lib/students/shared";
import type { StudentRow } from "@/lib/types";

export type NextSteps = {
  assessmentTitle: string;
  steps: string[];
} | null;

/** actionableSteps from the student's MOST RECENT approved report (visual checklist only, no persistence). */
export function computeNextSteps(studentId: number, student: StudentRow): NextSteps {
  const graded = listGradedSubmissions(studentId); // oldest -> newest

  for (let i = graded.length - 1; i >= 0; i--) {
    const { assessment, submission } = graded[i];
    const report = getReport(submission.id);
    if (!report || report.status !== "approved") continue;
    const sections = injectNameSections(report.sections, student.name, student.pseudonym);
    return { assessmentTitle: assessment.title, steps: sections.actionableSteps };
  }

  return null;
}
