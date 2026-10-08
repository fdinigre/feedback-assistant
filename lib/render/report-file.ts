// Pure Markdown rendering of one student's assessment report, for the
// per-student report file export. No "server-only" and no DB imports so it
// stays a plain formatter; the caller injects the real name first.

import type { ReportSections } from "@/lib/types";

export function renderReportMarkdown(args: {
  studentName: string;
  assessmentTitle: string;
  date: string | null;
  criteria: string[];
  gradeLine: string | null; // e.g. "Grade: 6 (78%)" for DP, "Levels: A:6, B:5" for MYP
  sections: ReportSections; // real name already injected
}): string {
  const { studentName, assessmentTitle, date, criteria, gradeLine, sections } = args;
  const lines: string[] = [];

  lines.push(`# ${assessmentTitle} — ${studentName}`);
  if (date) lines.push(`*${date}*`);
  if (criteria.length > 0) lines.push(`Criteria: ${criteria.join(", ")}`);
  if (gradeLine) lines.push(gradeLine);
  lines.push("");

  if (sections.dataCorrelation) {
    lines.push("## Data correlation");
    lines.push(sections.dataCorrelation);
    lines.push("");
  }

  lines.push("## Strengths");
  if (sections.strengths.length === 0) lines.push("_None recorded._");
  else sections.strengths.forEach((s) => lines.push(`- ${s}`));
  lines.push("");

  lines.push("## Areas for improvement");
  if (sections.areasForImprovement.length === 0) lines.push("_None recorded._");
  else sections.areasForImprovement.forEach((s) => lines.push(`- ${s}`));
  lines.push("");

  lines.push("## Actionable steps");
  if (sections.actionableSteps.length === 0) lines.push("_None recorded._");
  else sections.actionableSteps.forEach((s) => lines.push(`- ${s}`));
  lines.push("");

  lines.push("## Feedback comment");
  lines.push(sections.feedbackComment || "_None._");
  lines.push("");

  if (sections.toddleReport && sections.toddleReport.trim()) {
    lines.push("## Student report comment (Toddle)");
    lines.push(sections.toddleReport);
    lines.push("");
  }

  return lines.join("\n");
}

/** A filesystem-safe base name from a student's name (keeps letters of any script). */
export function safeFileBase(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, " ") // strip characters illegal in file names
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "student";
}
