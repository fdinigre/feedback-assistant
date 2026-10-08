import "server-only";

import {
  getClassesByProgramme,
  getExternalDataBySource,
  getIaExplorationByStudent,
  getReport,
  getStudent,
  listAssessments,
  listClasses,
  listIaDeadlines,
  listIaProgress,
  listClassPlanEntries,
  listStudents,
  listSubmissions,
  listTranscripts,
} from "@/lib/db/queries";
import { computeCompleteness, displayStatus } from "@/lib/assessment/completeness";
import { findDuplicateSubmissionIds } from "@/lib/intake/batch";
import { IA_MILESTONES, type SubmissionStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// "Needs your attention" — actionable items with links, aggregated across
// every assessment and submission. Read-only: composes existing query
// helpers from lib/db/queries.ts rather than writing new SQL.
// ---------------------------------------------------------------------------

export type NeedsAttentionItem = {
  id: string;
  text: string;
  href: string;
};

function countUnresolvedIllegible(submissionId: number): number {
  const transcripts = listTranscripts(submissionId);
  let count = 0;
  for (const t of transcripts) {
    for (const flag of t.content.illegible) {
      if (flag.resolvedText === undefined) count++;
    }
  }
  return count;
}

export function getNeedsAttentionItems(): NeedsAttentionItem[] {
  const items: NeedsAttentionItem[] = [];
  const assessments = listAssessments();

  for (const assessment of assessments) {
    if (assessment.status === "setup" && !computeCompleteness(assessment.id).ready) {
      const completeness = computeCompleteness(assessment.id);
      items.push({
        id: `setup-${assessment.id}`,
        text: `"${assessment.title}" is still in setup — missing ${completeness.missing
          .join("; ")
          .toLowerCase()}`,
        href: `/assessments/${assessment.id}/setup`,
      });
    }

    const submissions = listSubmissions(assessment.id);
    const duplicateIds = findDuplicateSubmissionIds(submissions);

    for (const s of submissions) {
      if (s.status === "absent") continue;

      const student = s.student_id !== null ? (getStudent(s.student_id) ?? null) : null;

      if (duplicateIds.has(s.id)) {
        items.push({
          id: `dup-${s.id}`,
          text: `Duplicate submission assigned to ${student?.name ?? "a student"} in "${assessment.title}" — resolve before continuing`,
          href: `/assessments/${assessment.id}/submissions`,
        });
      }

      if (s.status === "uploaded" && s.student_id === null) {
        items.push({
          id: `unassigned-${s.id}`,
          text: `A submission in "${assessment.title}" is uploaded but not assigned to a student`,
          href: `/assessments/${assessment.id}/submissions`,
        });
      }

      const unresolvedCount = countUnresolvedIllegible(s.id);
      if (unresolvedCount > 0) {
        items.push({
          id: `illegible-${s.id}`,
          text: `${student?.name ?? "A submission"} has ${unresolvedCount} unresolved illegible flag${
            unresolvedCount === 1 ? "" : "s"
          } in "${assessment.title}"`,
          href: `/submissions/${s.id}`,
        });
      }

      if (s.status === "graded") {
        const report = getReport(s.id);
        if (report && report.status === "draft") {
          items.push({
            id: `approve-${s.id}`,
            text: `${student?.name ?? "A submission"}'s report for "${assessment.title}" is graded and ready to approve`,
            href: `/submissions/${s.id}`,
          });
        }
      }
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Assessment progress cards
// ---------------------------------------------------------------------------

export type AssessmentProgressCard = {
  id: number;
  /** Null on an assessment that is not tied to one class. */
  classId: number | null;
  className: string;
  title: string;
  grade: number;
  criteria: string[];
  date: string | null;
  status: string;
  activeCount: number;
  toAssign: number;
  toTranscribe: number;
  toGrade: number;
  toReview: number;
  reviewedCount: number;
  absentCount: number;
};

const STATUS_COUNT_KEY: Record<SubmissionStatus, keyof AssessmentProgressCard | null> = {
  uploaded: "toAssign",
  assigned: "toTranscribe",
  transcribed: "toGrade",
  graded: "toReview",
  reviewed: "reviewedCount",
  absent: null,
};

/** Newest-first, matching listAssessments() ordering (created_at DESC). */
export function getAssessmentProgressCards(): AssessmentProgressCard[] {
  const assessments = listAssessments();
  const classNameById = new Map(listClasses().map((c) => [c.id, c.name]));
  return assessments.map((a) => {
    const submissions = listSubmissions(a.id);
    const absentCount = submissions.filter((s) => s.status === "absent").length;

    const card: AssessmentProgressCard = {
      id: a.id,
      classId: a.class_id,
      className: a.class_id === null ? "" : (classNameById.get(a.class_id) ?? ""),
      title: a.title,
      grade: a.grade,
      criteria: a.criteria,
      date: a.date,
      status: displayStatus(a),
      activeCount: submissions.length - absentCount,
      toAssign: 0,
      toTranscribe: 0,
      toGrade: 0,
      toReview: 0,
      reviewedCount: 0,
      absentCount,
    };

    for (const s of submissions) {
      const key = STATUS_COUNT_KEY[s.status];
      if (key && key in card) {
        (card[key] as number) += 1;
      }
    }

    return card;
  });
}

// ---------------------------------------------------------------------------
// Classes strip
// ---------------------------------------------------------------------------

export type ClassOverview = {
  id: number;
  name: string;
  grade: number;
  studentCount: number;
  mapCount: number;
  cat4Count: number;
};

// ---------------------------------------------------------------------------
// This week, from the year plans
// ---------------------------------------------------------------------------

export type WeekEntry = {
  id: number;
  className: string;
  date: string;
  topic: string;
  /** Non-empty where the planner named criteria, e.g. "End of unit test (A & C)". */
  criteria: string[];
  kind: "lesson" | "break";
};

/** Monday of the week containing `iso`, and the Sunday that ends it. */
function weekBounds(iso: string): [string, string] {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const back = (date.getUTCDay() + 6) % 7; // Sunday is 0, and the week starts Monday
  const monday = new Date(date.getTime() - back * 86400000);
  const sunday = new Date(monday.getTime() + 6 * 86400000);
  return [monday.toISOString().slice(0, 10), sunday.toISOString().slice(0, 10)];
}

/**
 * Every class's plan for the current week, in one chronological list. Classes
 * with no plan loaded simply contribute nothing, so this is empty rather than
 * broken before the planners are uploaded.
 */
/** The next thing the plan names as assessing a criterion, per class. */
export function getNextAssessedByClass(from: string): Map<number, WeekEntry> {
  const byClass = new Map<number, WeekEntry>();
  for (const cls of listClasses()) {
    for (const entry of listClassPlanEntries(cls.id, from)) {
      if (entry.criteria.length === 0 || entry.kind !== "lesson") continue;
      byClass.set(cls.id, {
        id: entry.id,
        className: cls.name,
        date: entry.date,
        topic: entry.topic,
        criteria: entry.criteria,
        kind: entry.kind,
      });
      break;
    }
  }
  return byClass;
}

export function getThisWeek(today: string): WeekEntry[] {
  const [monday, sunday] = weekBounds(today);
  const entries: WeekEntry[] = [];
  for (const cls of listClasses()) {
    for (const entry of listClassPlanEntries(cls.id, monday)) {
      if (entry.date > sunday) break; // ordered by date
      entries.push({
        id: entry.id,
        className: cls.name,
        date: entry.date,
        topic: entry.topic,
        criteria: entry.criteria,
        kind: entry.kind,
      });
    }
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.className.localeCompare(b.className));
}

export function getClassesOverview(): ClassOverview[] {
  const classes = listClasses();
  return classes.map((c) => {
    const students = listStudents(c.id);
    const mapCount = students.filter((s) => getExternalDataBySource(s.id, "MAP")).length;
    const cat4Count = students.filter((s) => getExternalDataBySource(s.id, "CAT4")).length;
    return {
      id: c.id,
      name: c.name,
      grade: c.grade,
      studentCount: students.length,
      mapCount,
      cat4Count,
    };
  });
}

// ---------------------------------------------------------------------------
// IA (Mathematical Exploration) attention tile — only relevant once a DP
// class exists. Counts students who are late on their NEAREST not-yet-done
// milestone (spec: "contagem de alunos atrasados no marco mais próximo").
// ---------------------------------------------------------------------------

export type IaAttentionSummary = { hasDpClass: boolean; lateCount: number };

export function getIaAttentionSummary(): IaAttentionSummary {
  const dpClasses = getClassesByProgramme("DP");
  if (dpClasses.length === 0) return { hasDpClass: false, lateCount: 0 };

  const now = new Date();
  let lateCount = 0;

  for (const cls of dpClasses) {
    const deadlineByMilestone = new Map(
      listIaDeadlines(cls.id).map((d) => [d.milestone, d.due_date] as const)
    );
    for (const student of listStudents(cls.id)) {
      const exploration = getIaExplorationByStudent(student.id);
      const doneSet = new Set(
        exploration ? listIaProgress(exploration.id).map((p) => p.milestone) : []
      );
      for (const milestone of IA_MILESTONES) {
        if (doneSet.has(milestone)) continue;
        const due = deadlineByMilestone.get(milestone);
        if (due && new Date(due) < now) lateCount++;
        break; // only the nearest pending milestone counts per student
      }
    }
  }

  return { hasDpClass: true, lateCount };
}
