import {
  getAssessment,
  getReport,
  listSubmissions,
  updateSubmission,
  upsertReport,
} from "@/lib/db/queries";
import { settleSubmission } from "@/lib/marking/settle";

type Body = { assessmentId: number };

/**
 * Approves every draft report in one assessment, and marks those submissions
 * reviewed — the bulk counterpart to approving one report at a time.
 *
 * Deliberately approves only what is already saved. The single-report route
 * accepts live `sections` from the screen because the teacher may have unsaved
 * edits in front of them; here there is no screen for each report, so approving
 * stored content is the only honest thing to do.
 *
 * Reports already approved are left alone rather than re-approved, so the count
 * returned reflects what actually changed.
 *
 * Each approval settles that paper's marks and levels at the value shown, as
 * the single-report route does.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as Partial<Body>;

  if (typeof body.assessmentId !== "number") {
    return Response.json({ error: "assessmentId is required" }, { status: 400 });
  }
  if (!getAssessment(body.assessmentId)) {
    return Response.json({ error: "Assessment not found" }, { status: 404 });
  }

  const submissions = listSubmissions(body.assessmentId).filter((s) => s.status !== "absent");

  let approved = 0;
  let alreadyApproved = 0;
  let withoutReport = 0;

  for (const submission of submissions) {
    const report = getReport(submission.id);
    if (!report) {
      withoutReport++;
      continue;
    }
    if (report.status === "approved") {
      alreadyApproved++;
      // Still make sure the submission reflects it — a report approved before
      // this route existed may have left the submission un-reviewed.
      if (submission.status !== "reviewed") updateSubmission(submission.id, { status: "reviewed" });
      continue;
    }

    upsertReport({
      submission_id: submission.id,
      sections: report.sections,
      status: "approved",
    });
    settleSubmission(submission.id);
    updateSubmission(submission.id, { status: "reviewed" });
    approved++;
  }

  return Response.json({ approved, alreadyApproved, withoutReport });
}
