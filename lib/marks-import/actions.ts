"use server";

import { revalidatePath } from "next/cache";
import {
  deleteMarksSheet,
  getAssessment,
  getStudent,
  getSubmission,
  listSubmissions,
  upsertMarksSheet,
} from "@/lib/db/queries";
import type { MarksUploadSummary } from "@/lib/types";
import { buildMarksDiff } from "./diff";
import { MarksSheetError, parseMarksSheet } from "./parse";
import { applySheetMarks, keepAppMark, settleIfSheetAgrees, storeSheetDifferences } from "./pending";

/**
 * Marks-sheet import: upload → the sheet and its comparison are kept → the
 * teacher settles each difference (on the student's review page, or all at
 * once) → the comparison stays until the teacher deletes the sheet.
 */

export type MarksUploadResult = { error: string | null };

function revalidate(assessmentId: number, submissionIds: Iterable<number>) {
  revalidatePath(`/assessments/${assessmentId}/submissions`);
  revalidatePath(`/assessments/${assessmentId}`);
  for (const id of submissionIds) revalidatePath(`/submissions/${id}`);
}

/**
 * Reads an uploaded marks spreadsheet and remembers where it differs from the
 * app's marks. No mark changes: the differences only wait to be settled.
 */
export async function uploadMarksSheetAction(
  assessmentId: number,
  fileName: string,
  base64: string
): Promise<MarksUploadResult> {
  const assessment = getAssessment(assessmentId);
  if (!assessment) return { error: "Assessment not found." };

  let sheet;
  try {
    sheet = await parseMarksSheet(Buffer.from(base64, "base64"));
  } catch (err) {
    if (err instanceof MarksSheetError) return { error: err.message };
    return { error: "That file could not be read as a spreadsheet." };
  }

  const diff = buildMarksDiff(assessment, sheet);
  const summary: MarksUploadSummary = {
    unchanged: diff.unchanged,
    unmatchedNames: diff.unmatchedNames,
    unmatchedLabels: diff.unmatchedLabels,
    missingFromSheet: diff.missingFromSheet,
    withoutSubmission: diff.withoutSubmission,
    overMax: diff.changes
      .filter((c) => c.overMax)
      .map((c) => `${c.studentName} ${c.label} (${c.incoming}/${c.maxPoints})`),
    unmarked: diff.changes.filter((c) => !c.overMax && c.current === null).length,
    ignoredColumns: diff.ignoredColumns,
  };

  storeSheetDifferences(assessment, diff);
  // A paper the sheet agrees with entirely is settled now. One with a mark over
  // the question's maximum is not: that cell is a mistake in the sheet, so the
  // sheet has not actually confirmed that mark.
  const overMaxPapers = new Set(diff.changes.filter((c) => c.overMax).map((c) => c.submissionId));
  for (const submissionId of diff.coveredSubmissions) {
    if (!overMaxPapers.has(submissionId)) settleIfSheetAgrees(assessmentId, submissionId, true);
  }
  upsertMarksSheet({
    assessment_id: assessmentId,
    // Only ever displayed; keep it to a plain, bounded name.
    file_name: fileName.replace(/[\\/]/g, "").slice(0, 200) || "marks sheet",
    summary,
  });
  // The previous sheet's flags may have sat on any paper, not just this one's.
  revalidate(
    assessmentId,
    listSubmissions(assessmentId).map((s) => s.id)
  );

  return { error: null };
}

export type MarksApplyResult = {
  error: string | null;
  marksChanged: number;
  levelsRecomputed: number;
  /** The papers whose report predates the new marks: the notice links each to its report. */
  reportsAffected: { submissionId: number; studentName: string }[];
};

/**
 * Replaces the app's mark with the teacher's sheet mark for the given
 * questions. Only keys are accepted — the marks themselves come from what the
 * upload stored, so a request can't write an arbitrary grade.
 */
export async function applySheetMarksAction(
  assessmentId: number,
  keys: { submissionId: number; questionId: number }[]
): Promise<MarksApplyResult> {
  const assessment = getAssessment(assessmentId);
  if (!assessment) {
    return { error: "Assessment not found.", marksChanged: 0, levelsRecomputed: 0, reportsAffected: [] };
  }

  const result = applySheetMarks(assessment, keys);

  const touched = new Set(keys.map((k) => k.submissionId));
  for (const submissionId of touched) settleIfSheetAgrees(assessmentId, submissionId);
  revalidate(assessmentId, touched);
  return {
    error: null,
    marksChanged: result.marksChanged,
    levelsRecomputed: result.levelsRecomputed,
    reportsAffected: result.reportsAffected.map((submissionId) => {
      const studentId = getSubmission(submissionId)?.student_id;
      return {
        submissionId,
        studentName: (studentId != null && getStudent(studentId)?.name) || `Submission ${submissionId}`,
      };
    }),
  };
}

/** The teacher checked a difference and is keeping the app's mark. */
export async function keepAppMarkAction(submissionId: number, questionId: number): Promise<void> {
  const submission = getSubmission(submissionId);
  if (!submission) return;
  keepAppMark(submissionId, questionId);
  settleIfSheetAgrees(submission.assessment_id, submissionId);
  revalidate(submission.assessment_id, [submissionId]);
}

/**
 * Deletes the uploaded sheet and its comparison. Marks already taken from it
 * stay; differences still waiting stop being flagged.
 */
export async function deleteMarksSheetAction(assessmentId: number): Promise<void> {
  deleteMarksSheet(assessmentId);
  revalidate(
    assessmentId,
    listSubmissions(assessmentId).map((s) => s.id)
  );
}
