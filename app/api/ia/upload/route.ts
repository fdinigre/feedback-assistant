import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getIaExploration, getStudent, insertIaDocument, setIaMilestoneComplete } from "@/lib/db/queries";
import { extractAndPseudonymize } from "@/lib/ia/extract";
import { iaDocumentsDir } from "@/lib/ia/paths";
import { uniqueFilePath } from "@/lib/intake/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ia/upload
 * multipart/form-data: { explorationId: string; kind: 'draft' | 'final'; file: File }
 *
 * Saves the original file locally, extracts its text 100% locally (mammoth for
 * .docx, mupdf for .pdf), and pseudonymizes the WHOLE document before it ever
 * touches ia_documents.text — the only copy that later reaches a prompt.
 * Automatically marks the corresponding milestone complete.
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const explorationId = Number(formData.get("explorationId"));
  const kind = String(formData.get("kind") ?? "");
  const file = formData.get("file");

  if (!Number.isInteger(explorationId) || (kind !== "draft" && kind !== "final") || !(file instanceof File)) {
    return NextResponse.json(
      { error: "explorationId (number), kind ('draft'|'final') and file are required." },
      { status: 400 }
    );
  }

  const exploration = getIaExploration(explorationId);
  if (!exploration) return NextResponse.json({ error: "Exploration not found." }, { status: 404 });
  const student = getStudent(exploration.student_id);
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  const ext = path.extname(file.name).toLowerCase();
  if (ext !== ".docx" && ext !== ".pdf") {
    return NextResponse.json(
      { error: `Unsupported file type "${ext}" — upload a .docx or .pdf.` },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const savedPath = uniqueFilePath(iaDocumentsDir(explorationId), file.name);
  fs.writeFileSync(savedPath, buffer);

  try {
    const extracted = await extractAndPseudonymize({
      buffer,
      originalName: file.name,
      studentName: student.name,
      pseudonym: student.pseudonym,
    });

    if (!extracted.text.trim()) {
      throw new Error(
        "No text could be extracted from the document — it may be empty or contain only scanned images."
      );
    }

    const document = insertIaDocument({
      exploration_id: explorationId,
      kind,
      file_path: savedPath,
      text: extracted.text,
      original_name: file.name,
    });

    setIaMilestoneComplete(explorationId, kind === "draft" ? "draft_submitted" : "final_submitted");

    return NextResponse.json({ document, replacements: extracted.replacements });
  } catch (err) {
    try {
      fs.rmSync(savedPath, { force: true });
    } catch {
      // best-effort cleanup
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
