import { getReport, updateSubmission, upsertReport } from "@/lib/db/queries";
import { settleSubmission } from "@/lib/marking/settle";
import type { ReportSections } from "@/lib/types";

type Body = { submissionId: number; sections?: ReportSections };

/**
 * Approves the report and marks the submission reviewed. Approves EXACTLY what the
 * teacher currently has on screen: the client sends the live `sections`, which are
 * persisted atomically with the approval so an unsaved edit can never be dropped.
 * (Older callers may omit `sections`; then the already-saved content is approved.)
 *
 * Approving also settles every mark and level on the paper at the value shown,
 * so nothing the teacher has signed off stays "provisional" (lib/marking/settle.ts).
 */
export async function POST(request: Request) {
  const body = (await request.json()) as Partial<Body>;

  if (typeof body.submissionId !== "number") {
    return Response.json({ error: "submissionId is required" }, { status: 400 });
  }

  const current = getReport(body.submissionId);
  if (!current) {
    return Response.json({ error: "No report to approve yet" }, { status: 404 });
  }

  const report = upsertReport({
    submission_id: body.submissionId,
    sections: body.sections ?? current.sections,
    status: "approved",
  });
  settleSubmission(body.submissionId);
  const submission = updateSubmission(body.submissionId, { status: "reviewed" });

  return Response.json({ report, submission });
}
