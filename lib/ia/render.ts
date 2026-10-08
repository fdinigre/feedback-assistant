// Re-injects the real student name into AI-generated IA text, mirroring
// lib/render/names.ts's injectName (which only covers ReportSections' shape).
// Pure module (no "server-only") — reused both server-side (initial page
// render) and client-side (immediately after a fresh "Generate" response,
// before the next full page refresh).

import { injectName } from "@/lib/render/names";
import type { IaCriterionMark, IaDraftFeedback, IaFinalMarks } from "@/lib/types";

export function injectNameDraftFeedback(
  fb: IaDraftFeedback,
  studentName: string,
  pseudonym?: string
): IaDraftFeedback {
  return {
    summary: injectName(fb.summary, studentName, pseudonym),
    toddleComment: fb.toddleComment
      ? injectName(fb.toddleComment, studentName, pseudonym)
      : fb.toddleComment,
    criteria: fb.criteria.map((c) => ({
      criterion: c.criterion,
      level: c.level ?? 0,
      evidence: (c.evidence ?? []).map((e) => ({
        quote: injectName(e.quote, studentName, pseudonym),
        location: injectName(e.location, studentName, pseudonym),
      })),
      strengths: c.strengths.map((s) => injectName(s, studentName, pseudonym)),
      gaps: c.gaps.map((s) => injectName(s, studentName, pseudonym)),
      suggestions: c.suggestions.map((s) => injectName(s, studentName, pseudonym)),
    })),
  };
}

function injectNameCriterionMark(
  c: IaCriterionMark,
  studentName: string,
  pseudonym?: string
): IaCriterionMark {
  return {
    criterion: c.criterion,
    proposed: c.proposed,
    final: c.final,
    evidence: c.evidence.map((e) => ({
      quote: injectName(e.quote, studentName, pseudonym),
      location: injectName(e.location, studentName, pseudonym),
    })),
    justification: injectName(c.justification, studentName, pseudonym),
  };
}

export function injectNameFinalMarks(
  marks: IaFinalMarks,
  studentName: string,
  pseudonym?: string
): IaFinalMarks {
  return {
    total: marks.total,
    criteria: marks.criteria.map((c) => injectNameCriterionMark(c, studentName, pseudonym)),
    toddleComment: marks.toddleComment
      ? injectName(marks.toddleComment, studentName, pseudonym)
      : marks.toddleComment,
    authenticity: marks.authenticity
      ? {
          level: marks.authenticity.level,
          notes: (marks.authenticity.notes ?? []).map((n) =>
            injectName(n, studentName, pseudonym)
          ),
        }
      : marks.authenticity,
  };
}
