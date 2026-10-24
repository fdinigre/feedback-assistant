import "server-only";

import {
  getStudent,
  hasErrorTags,
  hasSkillTags,
  listErrorTags,
  listQuestions,
  listSkillTags,
  listSubmissions,
} from "@/lib/db/queries";
import { MECHANISMS } from "@/lib/errors/taxonomy";
import { CORE_SKILLS } from "@/lib/errors/core-skills";

/**
 * What the mistake sorting found across one assessment's papers, for the class
 * view on the assessment page: which kinds of mistake, in which core skills, on
 * which questions, and who made them.
 *
 * Counted by student, not by question: "9 of 18 students" is what a teacher
 * re-teaches to, and one student making the same slip on four questions is one
 * student with a habit. Only sorted papers count — an unsorted paper cannot show
 * a mistake either way — so every share is out of the papers sorted so far.
 */

export type MistakeStudent = { submissionId: number; name: string; questions: string[] };

export type MistakeRow = {
  id: string;
  name: string;
  /** Mistake kinds only: in the maths itself, or in doing what the question asks. */
  about?: "maths" | "question";
  /** One entry per student, with the questions it happened on. */
  students: MistakeStudent[];
  /** Questions it happened on, across the class. */
  questionCount: number;
  /** The marking phrases behind the count, a few of them. */
  quotes: string[];
};

export type MistakeGridCell = { students: string[] };

export type AssessmentMistakes = {
  /** Papers with a student, transcribed and graded, that could be sorted. */
  papers: number;
  /** Of those, the papers the sorting has read. */
  sortedPapers: number;
  kinds: MistakeRow[];
  skills: MistakeRow[];
  /** The questions any mistake fell on, in the paper's order. */
  columns: { id: number; number: string }[];
  /** Mistake kind -> question id -> who made it there. */
  grid: Record<string, Record<number, MistakeGridCell>>;
};

type Tag = { question_id: number; key: string; quote: string };

function tally(
  papers: { submissionId: number; name: string }[],
  tagsOf: (submissionId: number) => Tag[],
  numberOf: Map<number, string>,
  defs: { id: string; name: string; about?: "maths" | "question" }[]
): MistakeRow[] {
  type Entry = { students: Map<number, MistakeStudent>; questionCount: number; quotes: string[] };
  const byKey = new Map<string, Entry>();
  for (const paper of papers) {
    for (const tag of tagsOf(paper.submissionId)) {
      const entry: Entry = byKey.get(tag.key) ?? { students: new Map(), questionCount: 0, quotes: [] };
      const student: MistakeStudent = entry.students.get(paper.submissionId) ?? { ...paper, questions: [] };
      const number = numberOf.get(tag.question_id);
      if (number && !student.questions.includes(number)) student.questions.push(number);
      entry.students.set(paper.submissionId, student);
      entry.questionCount += 1;
      if (tag.quote && entry.quotes.length < 4) entry.quotes.push(tag.quote);
      byKey.set(tag.key, entry);
    }
  }
  const rows: MistakeRow[] = [];
  for (const def of defs) {
    const entry = byKey.get(def.id);
    if (!entry) continue;
    rows.push({
      id: def.id,
      name: def.name,
      ...(def.about ? { about: def.about } : {}),
      students: [...entry.students.values()].sort((a, b) => a.name.localeCompare(b.name)),
      questionCount: entry.questionCount,
      quotes: entry.quotes,
    });
  }
  // Most students first; then most questions; then the taxonomy's own order (stable sort).
  return rows.sort((a, b) => b.students.length - a.students.length || b.questionCount - a.questionCount);
}

export function computeAssessmentMistakes(assessmentId: number): AssessmentMistakes {
  const questions = listQuestions(assessmentId);
  const numberOf = new Map(questions.map((q) => [q.id, q.number]));
  const graded = listSubmissions(assessmentId).filter(
    (s) => s.student_id !== null && (s.status === "graded" || s.status === "reviewed")
  );
  const sorted = graded.filter((s) => hasErrorTags(s.id) || hasSkillTags(s.id));
  const papers = sorted.map((s) => ({
    submissionId: s.id,
    name: getStudent(s.student_id as number)?.name ?? `Paper ${s.id}`,
  }));

  const errorTags = new Map(papers.map((p) => [p.submissionId, listErrorTags(p.submissionId)]));
  const kinds = tally(
    papers,
    (id) => (errorTags.get(id) ?? []).map((t) => ({ question_id: t.question_id, key: t.mechanism, quote: t.quote })),
    numberOf,
    MECHANISMS
  );
  const skills = tally(
    papers,
    (id) => listSkillTags(id).map((t) => ({ question_id: t.question_id, key: t.skill, quote: t.quote })),
    numberOf,
    CORE_SKILLS
  );

  const grid: Record<string, Record<number, MistakeGridCell>> = {};
  const used = new Set<number>();
  for (const paper of papers) {
    for (const tag of errorTags.get(paper.submissionId) ?? []) {
      const row = (grid[tag.mechanism] ??= {});
      const cell = (row[tag.question_id] ??= { students: [] });
      if (!cell.students.includes(paper.name)) cell.students.push(paper.name);
      used.add(tag.question_id);
    }
  }

  return {
    papers: graded.length,
    sortedPapers: sorted.length,
    kinds,
    skills,
    columns: questions.filter((q) => used.has(q.id)).map((q) => ({ id: q.id, number: q.number })),
    grid,
  };
}
