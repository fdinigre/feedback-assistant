import "server-only";

import { listAssessments, listGradings, listSubmissions } from "@/lib/db/queries";
import type { AssessmentRow, SubmissionRow } from "@/lib/types";

export type GradedSubmission = { assessment: AssessmentRow; submission: SubmissionRow };

/**
 * All submissions for this student that have at least one grading row, oldest
 * first (by assessment date, falling back to created_at). "Graded" here means
 * "has grading data" rather than a specific submission.status, so it also
 * covers submissions that have since moved on to status 'reviewed'.
 *
 * Mirrors the walk-every-assessment pattern in lib/render/dossier.ts — there
 * is no direct "submissions by student" query, and at this app's scale
 * (~90 students, a handful of assessments per year) that's fine.
 */
export function listGradedSubmissions(studentId: number): GradedSubmission[] {
  const out: GradedSubmission[] = [];
  for (const assessment of listAssessments()) {
    for (const submission of listSubmissions(assessment.id)) {
      if (submission.student_id !== studentId) continue;
      if (listGradings(submission.id).length === 0) continue;
      out.push({ assessment, submission });
    }
  }
  out.sort((a, b) => {
    const dateA = a.assessment.date ?? a.assessment.created_at;
    const dateB = b.assessment.date ?? b.assessment.created_at;
    return dateA.localeCompare(dateB);
  });
  return out;
}
