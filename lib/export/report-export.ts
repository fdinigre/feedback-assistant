import "server-only";

import {
  getDpResult,
  getReport,
  getStudent,
  listCriterionLevels,
} from "@/lib/db/queries";
import { isFmTest } from "@/lib/assessment/course";
import { formatTestScore, testScore } from "@/lib/assessment/test-score";
import { injectNameSections } from "@/lib/render/names";
import { renderReportMarkdown, safeFileBase } from "@/lib/render/report-file";
import type { AssessmentRow, SubmissionRow } from "@/lib/types";

export type SubmissionReport = {
  /** Filename stem, without extension — the student's name, made file-safe. */
  fileBase: string;
  studentName: string;
  markdown: string;
};

/**
 * Renders one student's report as Markdown, with their real name put back in.
 *
 * Shared by the whole-assessment ZIP export and the single-student download, so
 * the two can't drift into producing different documents for the same student.
 * Returns null when the submission has no report yet.
 */
export function buildSubmissionReport(
  assessment: AssessmentRow,
  submission: SubmissionRow
): SubmissionReport | null {
  const report = getReport(submission.id);
  if (!report) return null;

  const student = submission.student_id ? getStudent(submission.student_id) : undefined;
  const studentName = student?.name ?? `Unassigned (submission ${submission.id})`;

  // Names live only on this machine: generated text carries a pseudonym, and the
  // real name goes back in here, at render time.
  //
  // First name only. Every section is written to the student in second person,
  // so a full name mid-sentence reads like a form letter. The heading and the
  // filename keep the full name — those identify whose report this is, and two
  // students can share a first name.
  const sections = student
    ? injectNameSections(report.sections, student.name, student.pseudonym)
    : report.sections;

  let gradeLine: string | null = null;
  if (assessment.programme === "DP") {
    const result = getDpResult(submission.id);
    if (result) gradeLine = `Grade: ${result.grade_final ?? result.grade} (${result.pct.toFixed(0)}%)`;
  } else if (isFmTest(assessment)) {
    const score = testScore(assessment, submission);
    if (score) gradeLine = `Score: ${formatTestScore(score)}`;
  } else {
    const levels = listCriterionLevels(submission.id);
    if (levels.length > 0) {
      gradeLine =
        "Levels: " +
        levels.map((l) => `${l.criterion}:${l.level_final ?? l.level_conservative}`).join(", ");
    }
  }

  return {
    fileBase: safeFileBase(studentName),
    studentName,
    markdown: renderReportMarkdown({
      studentName,
      assessmentTitle: assessment.title,
      date: assessment.date,
      criteria: assessment.criteria,
      gradeLine,
      sections,
    }),
  };
}
