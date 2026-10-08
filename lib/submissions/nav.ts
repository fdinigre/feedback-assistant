import "server-only";

import { getStudent, listSubmissions } from "@/lib/db/queries";
import type { SubmissionRow } from "@/lib/types";

export type SubmissionNav = {
  /** 1-based position of the current submission among eligible ones, or null if it's absent/not found. */
  position: number | null;
  total: number;
  prevId: number | null;
  nextId: number | null;
  nextNeedingReviewId: number | null;
};

type Entry = { submission: SubmissionRow; name: string };

/**
 * Orders an assessment's non-absent submissions by student name
 * (case-insensitive) — the order a teacher scans the roster in during batch
 * review, not upload/id order. Absent submissions are excluded entirely, per
 * spec: they carry no review work.
 */
function orderedEligibleSubmissions(assessmentId: number): Entry[] {
  const submissions = listSubmissions(assessmentId).filter((s) => s.status !== "absent");
  const entries: Entry[] = submissions.map((submission) => {
    const student = submission.student_id !== null ? getStudent(submission.student_id) : undefined;
    return { submission, name: student?.name ?? "" };
  });
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return entries;
}

/** Prev/next/position + "next needing review" for the submission review page's nav bar. */
export function computeSubmissionNav(assessmentId: number, currentSubmissionId: number): SubmissionNav {
  const entries = orderedEligibleSubmissions(assessmentId);
  const idx = entries.findIndex((e) => e.submission.id === currentSubmissionId);
  const total = entries.length;
  const position = idx >= 0 ? idx + 1 : null;
  const prevId = idx > 0 ? entries[idx - 1].submission.id : null;
  const nextId = idx >= 0 && idx < total - 1 ? entries[idx + 1].submission.id : null;

  let nextNeedingReviewId: number | null = null;
  if (idx >= 0) {
    for (let i = idx + 1; i < total; i++) {
      if (entries[i].submission.status !== "reviewed") {
        nextNeedingReviewId = entries[i].submission.id;
        break;
      }
    }
  }

  return { position, total, prevId, nextId, nextNeedingReviewId };
}
