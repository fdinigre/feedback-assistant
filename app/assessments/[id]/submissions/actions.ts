"use server";

import fs from "node:fs";
import { revalidatePath } from "next/cache";
import {
  deleteSubmission,
  getReport,
  getSubmission,
  insertSubmission,
  listGradings,
  listTranscripts,
  unapproveReportIfApproved,
  updateSubmission,
} from "@/lib/db/queries";
import { pagesDir } from "@/lib/intake/paths";
import type { SubmissionStatus } from "@/lib/types";

function refresh(assessmentId: number) {
  revalidatePath(`/assessments/${assessmentId}/submissions`);
}

/**
 * How far a paper has got, from the work on file rather than from what was
 * last clicked: an approved report, marks, a transcript, or none yet.
 */
function statusFromWork(submissionId: number): SubmissionStatus {
  if (getReport(submissionId)?.status === "approved") return "reviewed";
  if (listGradings(submissionId).length > 0) return "graded";
  if (listTranscripts(submissionId).length > 0) return "transcribed";
  return "assigned";
}

/**
 * Assigns (or clears) the student for a submission (spec: batch intake,
 * assignment table).
 *
 * Moving a paper to another student keeps its transcript and marks — they
 * belong to the paper, not to whoever it was filed under — and so keeps its
 * place in the pipeline. The report is the exception: it was written with the
 * other student's MAP, CAT4 and history beside it, so an approved one goes
 * back to draft for a second look before it is shared.
 */
export async function assignStudent(submissionId: number, formData: FormData) {
  const submission = getSubmission(submissionId);
  if (!submission) return;

  const raw = formData.get("studentId");
  const studentId = raw && raw !== "" ? Number(raw) : null;

  if (studentId === null) {
    // Unassigned papers wait at the start; their work stays on file and comes
    // back with them when they are assigned again.
    updateSubmission(submissionId, { student_id: null, status: "uploaded" });
  } else {
    if (studentId !== submission.student_id) unapproveReportIfApproved(submissionId);
    updateSubmission(submissionId, { student_id: studentId, status: statusFromWork(submissionId) });
  }
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
