import { getAssessment, getSubmission } from "@/lib/db/queries";
import { buildSubmissionReport } from "@/lib/export/report-export";

// One student's report as a Markdown file. The whole-assessment ZIP lives at
// /api/export/assessment/[id]/reports; this is the single-student counterpart,
// so the review page can offer a download for the student in front of you
// without also offering the whole class.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const submissionId = Number(id);
  const submission = Number.isInteger(submissionId) ? getSubmission(submissionId) : undefined;
  if (!submission) {
    return new Response("Submission not found", { status: 404 });
  }

  const assessment = getAssessment(submission.assessment_id);
  if (!assessment) {
    return new Response("Assessment not found", { status: 404 });
  }

  const report = buildSubmissionReport(assessment, submission);
  if (!report) {
    return new Response("No report for this student yet — generate one first.", { status: 404 });
  }

  return new Response(report.markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report.fileBase}.md"`,
      "Cache-Control": "no-store",
    },
  });
}
