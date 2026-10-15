import "server-only";

import { getStudent, listQuestions, listSubmissions, listTranscripts } from "@/lib/db/queries";
import { blockingFlags } from "@/lib/submissions/review-state";
import type { SubmissionRow } from "@/lib/types";

export type SubmissionNav = {
  /** 1-based position of the current submission among eligible ones, or null if it's absent/not found. */
  position: number | null;
  total: number;
  prevId: number | null;
  nextId: number | null;
  /**
   * The next paper with an orange line — a part the AI couldn't read ("[?]") still
   * to fix — after this one, wrapping round to the start; null when no other paper
   * has one. "Needing review" used to mean "report not yet approved", which is
   * nearly every paper, so the button only ever went to the next student.
   */
  nextNeedingReviewId: number | null;
  /** That paper's first question with an orange line, for the link to land on. */
  nextNeedingReviewQuestionId: number | null;
  /** How many other papers have orange lines. */
  needingReviewCount: number;
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

  // Each paper's first question with an orange line, in the paper's question order.
  const order = new Map(listQuestions(assessmentId).map((q, i) => [q.id, i]));
  const firstOrange = (submissionId: number): number | null => {
    const open = listTranscripts(submissionId)
      .filter((t) => blockingFlags(t.content).length > 0)
      .map((t) => t.question_id)
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    return open[0] ?? null;
  };

  let nextNeedingReviewId: number | null = null;
  let nextNeedingReviewQuestionId: number | null = null;
  let needingReviewCount = 0;
  // After this paper first, then round from the start; never this paper itself.
  const start = idx >= 0 ? idx + 1 : 0;
  for (let k = 0; k < total; k++) {
    const entry = entries[(start + k) % total];
    if (entry.submission.id === currentSubmissionId) continue;
    const questionId = firstOrange(entry.submission.id);
    if (questionId === null) continue;
    needingReviewCount++;
    if (nextNeedingReviewId === null) {
      nextNeedingReviewId = entry.submission.id;
      nextNeedingReviewQuestionId = questionId;
    }
  }

  return { position, total, prevId, nextId, nextNeedingReviewId, nextNeedingReviewQuestionId, needingReviewCount };
}
