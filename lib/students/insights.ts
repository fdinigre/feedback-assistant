import "server-only";

import fs from "node:fs";
import path from "node:path";
import { runAi } from "@/lib/ai/provider";
import { getReport, getStudent, listGradings, listQuestions } from "@/lib/db/queries";
import { getForbiddenNames, scrubOutput } from "@/lib/pipeline/guards";
import { listGradedSubmissions } from "@/lib/students/shared";
import { sumQuestionMarks, pickFinal } from "@/lib/submissions/dp-calc";

// Cached on the filesystem, NOT in the DB — the schema is owned by another
// agent, and this is disposable, regeneratable derived content anyway.
const INSIGHTS_DIR = path.join(process.cwd(), "data", "insights");

export type StudentInsights = {
  studentId: number;
  digest: string;
  generatedAt: string; // ISO timestamp
  warnings: string[];
};

function cachePath(studentId: number): string {
  return path.join(INSIGHTS_DIR, `${studentId}.json`);
}

/** Reads the cached digest for a student, or null if none has been generated yet. */
export function getCachedInsights(studentId: number): StudentInsights | null {
  const file = cachePath(studentId);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as StudentInsights;
  } catch {
    return null;
  }
}

/**
 * Generates (or regenerates) an AI digest of recurring mathematical error
 * patterns for this student, grounded in ALL of their grading evidence +
 * report sections. Privacy: the model only ever sees the pseudonym in the
 * prompt and is instructed to address the student as the literal token
 * {{NAME}}; getForbiddenNames()/runClaude enforce that no real name leaks
 * in, and scrubOutput is a belt-and-braces check on the way out (same
 * pattern as lib/pipeline/report.ts).
 */
export async function generateInsights(studentId: number): Promise<StudentInsights> {
  const student = getStudent(studentId);
  if (!student) throw new Error(`insights: student ${studentId} not found`);

  const graded = listGradedSubmissions(studentId);
  if (graded.length === 0) {
    throw new Error("insights: this student has no graded submissions yet");
  }

  const forbiddenNames = getForbiddenNames(student.class_id);

  const evidenceBlock = graded
    .map(({ assessment, submission }) => {
      const qById = new Map(listQuestions(assessment.id).map((q) => [q.id, q]));
      const lines = listGradings(submission.id)
        .map((g) => {
          const c = g.content as Record<string, unknown>;
          const q = qById.get(g.question_id);
          const num = q?.number ?? (c.questionNumber as string) ?? "?";
          // DP gradings hold sub-part awards; MYP gradings hold a single point value.
          if (Array.isArray(c.subparts)) {
            const pts = sumQuestionMarks(g.content as never, q?.dp_scheme, pickFinal);
            const ev = (c.subparts as { awards?: { code: string; awarded: boolean; evidence: string }[] }[])
              .flatMap((sp) => (sp.awards ?? []).map((a) => `${a.code} ${a.awarded ? "✓" : "✗"}: ${a.evidence}`))
              .join("; ");
            return `- Q${num} (${pts} pts): ${ev}`;
          }
          const pts =
            (c.finalPoints as number | null) ??
            (c.conservativePoints as number | undefined) ??
            (c.proposedPoints as number | undefined) ??
            0;
          return `- Q${num} (${pts} pts, followThrough=${c.followThrough}): ${c.evidence}`;
        })
        .join("\n");
      return `### ${assessment.title}\n${lines}`;
    })
    .join("\n\n");

  const reportBlock = graded
    .map(({ assessment, submission }) => {
      const report = getReport(submission.id);
      if (!report) return null;
      const s = report.sections;
      return (
        `### ${assessment.title} (report: ${report.status})\n` +
        `Strengths: ${s.strengths.join("; ") || "(none recorded)"}\n` +
        `Areas for improvement: ${s.areasForImprovement.join("; ") || "(none recorded)"}`
      );
    })
    .filter((x): x is string => x !== null)
    .join("\n\n");

  const prompt = `You are analyzing a mathematics student's grading history to find RECURRING error patterns across assessments (not one-off mistakes).

CRITICAL — PRIVACY: You do not know this student's real name and must never invent or guess one. Refer to them ONLY using the literal token {{NAME}} if you need to address them directly.

GRADING EVIDENCE, per question, across every graded assessment on file for this student:
${evidenceBlock}

REPORT SECTIONS already written for this student (for extra context, may be empty):
${reportBlock || "(no reports yet)"}

Write a short digest (aim for 3-6 bullet points) of RECURRING mathematical error patterns — patterns that appear more than once across the evidence above — with specific evidence citations (assessment title + question number). Do not present an isolated single mistake as if it were a pattern. Ground every claim strictly in the evidence given; never invent facts, scores, or steps that are not there. Plain text bullets, no markdown headers.`;

  const raw = await runAi({ purpose: "student-insights", prompt, forbiddenNames });
  const { text, warnings } = scrubOutput(raw, forbiddenNames);

  const result: StudentInsights = {
    studentId,
    digest: text.trim(),
    generatedAt: new Date().toISOString(),
    warnings,
  };

  fs.mkdirSync(INSIGHTS_DIR, { recursive: true });
  fs.writeFileSync(cachePath(studentId), JSON.stringify(result, null, 2), "utf-8");

  return result;
}
