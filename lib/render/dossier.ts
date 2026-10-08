import "server-only";

import { getReport, listAssessments, listSubmissions } from "@/lib/db/queries";
import type { AssessmentRow, ReportRow, StudentRow, SubmissionRow } from "@/lib/types";
import { injectNameSections } from "@/lib/render/names";

export type DossierEntry = {
  assessment: AssessmentRow;
  submission: SubmissionRow;
  report: ReportRow;
};

/**
 * All APPROVED reports for a student across every assessment, oldest first.
 * There is no direct "submissions by student" query, so this walks every
 * assessment's submissions and filters — fine at this app's scale (~90
 * students, a handful of assessments per year).
 */
export function getStudentDossier(studentId: number): DossierEntry[] {
  const entries: DossierEntry[] = [];
  for (const assessment of listAssessments()) {
    for (const submission of listSubmissions(assessment.id)) {
      if (submission.student_id !== studentId) continue;
      const report = getReport(submission.id);
      if (!report || report.status !== "approved") continue;
      entries.push({ assessment, submission, report });
    }
  }
  entries.sort((a, b) => {
    const dateA = a.assessment.date ?? a.assessment.created_at;
    const dateB = b.assessment.date ?? b.assessment.created_at;
    return dateA.localeCompare(dateB);
  });
  return entries;
}

export function renderDossierMarkdown(student: StudentRow, entries: DossierEntry[]): string {
  const lines: string[] = [];
  lines.push(`# Dossier — ${student.name}`);
  lines.push("");
  lines.push(
    `Accumulated approved assessment reports, oldest to most recent. Generated for use as AI context.`
  );
  lines.push("");

  if (entries.length === 0) {
    lines.push("_No approved reports yet._");
    return lines.join("\n");
  }

  for (const { assessment, report } of entries) {
    const sections = injectNameSections(report.sections, student.name, student.pseudonym);
    lines.push("---");
    lines.push("");
    lines.push(`## ${assessment.title}${assessment.date ? ` — ${assessment.date}` : ""}`);
    lines.push("");
    lines.push(`Criteria: ${assessment.criteria.join(", ")}`);
    lines.push("");

    lines.push("### Data Correlation (Internal Insight)");
    lines.push(sections.dataCorrelation ?? "_No external data (MAP/CAT4) on file for this student._");
    lines.push("");

    lines.push("### Strengths");
    if (sections.strengths.length === 0) lines.push("_None recorded._");
    else sections.strengths.forEach((s) => lines.push(`- ${s}`));
    lines.push("");

    lines.push("### Areas for Improvement");
    if (sections.areasForImprovement.length === 0) lines.push("_None recorded._");
    else sections.areasForImprovement.forEach((s) => lines.push(`- ${s}`));
    lines.push("");

    lines.push("### Actionable Steps");
    if (sections.actionableSteps.length === 0) lines.push("_None recorded._");
    else sections.actionableSteps.forEach((s) => lines.push(`- ${s}`));
    lines.push("");

    lines.push("### Feedback Comment");
    lines.push(sections.feedbackComment);
    lines.push("");
  }

  return lines.join("\n");
}
