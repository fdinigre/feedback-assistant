import { getReport, upsertReport } from "@/lib/db/queries";
import type { ReportSections } from "@/lib/types";

type Body = {
  submissionId: number;
  sections: ReportSections;
};

/** Saves report edits without changing its approval status. */
export async function POST(request: Request) {
  const body = (await request.json()) as Partial<Body>;

  if (typeof body.submissionId !== "number" || !body.sections) {
    return Response.json(
      { error: "submissionId and sections are required" },
      { status: 400 }
    );
  }

  const current = getReport(body.submissionId);
  const row = upsertReport({
    submission_id: body.submissionId,
    sections: body.sections,
    status: current?.status ?? "draft",
  });

  return Response.json({ report: row });
}
