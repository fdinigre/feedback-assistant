import { NextResponse } from "next/server";
import { processUploadedPdf } from "@/lib/intake/process-upload";
import { recomputePageCountWarnings } from "@/lib/intake/batch";
import { parsePagesPerTest, splitPartName, unevenSplitNote } from "@/lib/intake/split";
import { splitPdf } from "@/lib/pdf";

/**
 * POST /api/intake/upload
 * multipart/form-data: { assessmentId: string; files: File[]; pagesPerTest?: string }
 *
 * Saves each PDF, rasterizes it, masks page 1, and records a submission row.
 * Corrupt/unreadable files fail individually with a clear per-file error while
 * the rest of the batch continues (spec edge case). Works as a plain HTML form
 * submission (no client JS): responds with a redirect back to the submissions
 * page, carrying per-file failures in the query string for display.
 *
 * With "pages per test", each file is a whole class scanned in one go: it is cut
 * into tests of that many pages, in scan order, and each becomes a submission of
 * its own — exactly as if it had been uploaded on its own.
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const assessmentIdRaw = formData.get("assessmentId");
  const assessmentId = Number(assessmentIdRaw);

  if (!assessmentIdRaw || !Number.isInteger(assessmentId)) {
    return NextResponse.json({ error: "Missing or invalid assessmentId." }, { status: 400 });
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const pagesPerTest = parsePagesPerTest(formData.get("pagesPerTest"));

  let uploaded = 0;
  const failed: { filename: string; error: string }[] = [];
  const notes: string[] = [];

  if (pagesPerTest === "invalid") {
    failed.push({ filename: "Pages per test", error: "must be a whole number of 1 or more — nothing was uploaded." });
  } else {
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());

      let parts: { name: string; bytes: Buffer }[] = [{ name: file.name, bytes: buffer }];
      if (pagesPerTest !== null) {
        let split: ReturnType<typeof splitPdf>;
        try {
          split = splitPdf(buffer, pagesPerTest);
        } catch (err) {
          failed.push({
            filename: file.name,
            error: `Could not split it into tests — it may be corrupt or not a valid PDF (${(err as Error).message}).`,
          });
          continue;
        }
        // A file no longer than one test is uploaded as it is, under its own name.
        if (split.parts.length > 1) {
          parts = split.parts.map((p, i) => ({
            name: splitPartName(file.name, i, split.parts.length, p.range),
            bytes: p.bytes,
          }));
          const note = unevenSplitNote(file.name, split.pageCount, pagesPerTest, parts[parts.length - 1].name);
          if (note) notes.push(note);
        }
      }

      for (const part of parts) {
        const result = await processUploadedPdf(assessmentId, part.name, part.bytes);
        if (result.ok) {
          uploaded += 1;
        } else {
          failed.push({ filename: result.filename, error: result.error });
        }
      }
    }
  }

  if (uploaded > 0) {
    recomputePageCountWarnings(assessmentId);
  }

  const redirectUrl = new URL(`/assessments/${assessmentId}/submissions`, request.url);
  redirectUrl.searchParams.set("uploaded", String(uploaded));
  if (pagesPerTest !== null && pagesPerTest !== "invalid" && uploaded > 0) {
    redirectUrl.searchParams.set("split", String(pagesPerTest));
  }
  if (failed.length > 0) {
    redirectUrl.searchParams.set("failed", JSON.stringify(failed));
  }
  if (notes.length > 0) {
    redirectUrl.searchParams.set("notes", JSON.stringify(notes));
  }

  return NextResponse.redirect(redirectUrl, 303);
}
