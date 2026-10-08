"use server";

import fs from "node:fs";
import { revalidatePath } from "next/cache";
import {
  deleteSubmission,
  getSubmission,
  insertSubmission,
  updateSubmission,
} from "@/lib/db/queries";
import { pagesDir } from "@/lib/intake/paths";
import type { SubmissionStatus } from "@/lib/types";

function refresh(assessmentId: number) {
  revalidatePath(`/assessments/${assessmentId}/submissions`);
}

/** Assigns (or clears) the student for a submission (spec: batch intake, assignment table). */
export async function assignStudent(submissionId: number, formData: FormData) {
  const submission = getSubmission(submissionId);
  if (!submission) return;

  const raw = formData.get("studentId");
  const studentId = raw && raw !== "" ? Number(raw) : null;
  const status: SubmissionStatus = studentId !== null ? "assigned" : "uploaded";

  updateSubmission(submissionId, { student_id: studentId, status });
  refresh(submission.assessment_id);
}

/** Records a roster student as absent for this assessment (spec edge case: student absent / no PDF). */
export async function markAbsent(assessmentId: number, studentId: number, _formData: FormData) {
  insertSubmission({
    assessment_id: assessmentId,
    student_id: studentId,
    pdf_path: null,
    status: "absent",
  });
  refresh(assessmentId);
}

/** Undoes a "mark absent" action, removing the placeholder submission row. */
export async function undoAbsent(submissionId: number, _formData: FormData) {
  const submission = getSubmission(submissionId);
  if (!submission) return;
  deleteSubmission(submissionId);
  refresh(submission.assessment_id);
}

export type DeleteSubmissionState = { error: string | null };

/**
 * Permanently deletes an uploaded submission (a scanned test file) whether or
 * not it is assigned to a student: its DB rows (transcripts, gradings, levels,
 * report, DP result) cascade away, and its on-disk artifacts (rasterized pages
 * and the uploaded PDF) are removed. Absent placeholders use undoAbsent instead.
 */
export async function deleteSubmissionAction(
  _prev: DeleteSubmissionState,
  formData: FormData
): Promise<DeleteSubmissionState> {
  const submissionId = Number(formData.get("submissionId"));
  if (!Number.isInteger(submissionId)) return { error: "Invalid submission." };

  const submission = getSubmission(submissionId);
  if (!submission) return { error: "Submission not found." };

  // Remove DB rows first (foreign keys are enforced), then on-disk files.
  deleteSubmission(submissionId);

  try {
    fs.rmSync(pagesDir(submissionId), { recursive: true, force: true });
  } catch {
    // best-effort — a missing pages dir is fine
  }
  if (submission.pdf_path) {
    try {
      fs.rmSync(submission.pdf_path, { force: true });
    } catch {
      // best-effort — the PDF may already be gone
    }
  }

  refresh(submission.assessment_id);
  return { error: null };
}

/** Saves which pages of a submission are scratch work (spec: scratch pages). */
export async function saveScratchPages(submissionId: number, formData: FormData) {
  const submission = getSubmission(submissionId);
  if (!submission) return;

  const pages = formData
    .getAll("page")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n));

  updateSubmission(submissionId, { scratch_pages: pages.length > 0 ? pages : null });
  refresh(submission.assessment_id);
}
