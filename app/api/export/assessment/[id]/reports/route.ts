import { getAssessment, listSubmissions } from "@/lib/db/queries";
import { buildSubmissionReport } from "@/lib/export/report-export";
import { createZip, type ZipEntry } from "@/lib/export/zip";

// Bundles every student's report for one assessment as individual Markdown
// files inside a single ZIP download (one file per student).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const assessmentId = Number(id);
  const assessment = getAssessment(assessmentId);
  if (!assessment) {
    return new Response("Assessment not found", { status: 404 });
  }

  const submissions = listSubmissions(assessmentId).filter((s) => s.status !== "absent");

  const entries: ZipEntry[] = [];
  const usedNames = new Set<string>();

  for (const submission of submissions) {
    const report = buildSubmissionReport(assessment, submission);
    if (!report) continue; // only students who have a report

    // Unique .md filename per student (dedupe collisions with the submission id).
    let base = report.fileBase;
    if (usedNames.has(base.toLowerCase())) base = `${base} (${submission.id})`;
    usedNames.add(base.toLowerCase());
    entries.push({ name: `${base}.md`, content: report.markdown });
  }

  if (entries.length === 0) {
    return new Response("No reports to export yet — generate reports first.", { status: 404 });
  }

  const zip = createZip(entries);
  const safeTitle = assessment.title.replace(/[^a-z0-9]+/gi, "-");
  return new Response(new Uint8Array(zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeTitle}-reports.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
