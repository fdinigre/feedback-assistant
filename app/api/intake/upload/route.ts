import { NextResponse } from "next/server";
import { processUploadedPdf } from "@/lib/intake/process-upload";
import { recomputePageCountWarnings } from "@/lib/intake/batch";

/**
 * POST /api/intake/upload
 * multipart/form-data: { assessmentId: string; files: File[] }
 *
 * Saves each PDF, rasterizes it, masks page 1, and records a submission row.
 * Corrupt/unreadable files fail individually with a clear per-file error while
 * the rest of the batch continues (spec edge case). Works as a plain HTML form
 * submission (no client JS): responds with a redirect back to the submissions
 * page, carrying per-file failures in the query string for display.
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const assessmentIdRaw = formData.get("assessmentId");
  const assessmentId = Number(assessmentIdRaw);

  if (!assessmentIdRaw || !Number.isInteger(assessmentId)) {
    return NextResponse.json({ error: "Missing or invalid assessmentId." }, { status: 400 });
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  let uploaded = 0;
  const failed: { filename: string; error: string }[] = [];

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    // eslint-disable-next-line no-await-in-loop
    const result = await processUploadedPdf(assessmentId, file.name, buffer);
    if (result.ok) {
      uploaded += 1;
    } else {
      failed.push({ filename: result.filename, error: result.error });
    }
  }

  if (uploaded > 0) {
    recomputePageCountWarnings(assessmentId);
  }

  const redirectUrl = new URL(`/assessments/${assessmentId}/submissions`, request.url);
  redirectUrl.searchParams.set("uploaded", String(uploaded));
  if (failed.length > 0) {
    redirectUrl.searchParams.set("failed", JSON.stringify(failed));
  }

  return NextResponse.redirect(redirectUrl, 303);
}
