import {
  getAssessment,
  getDpResult,
  getLearningTarget,
  getStudent,
  listCriterionLevels,
  listGradings,
  listQuestions,
  listSubmissions,
} from "@/lib/db/queries";
import { sumQuestionMarks, pickFinal } from "@/lib/submissions/dp-calc";
import { isFmTest } from "@/lib/assessment/course";
import { testScore } from "@/lib/assessment/test-score";
import type { DpGradingQuestion, GradingQuestion } from "@/lib/types";

function csvCell(value: string | number): string {
  let str = String(value);
  // Neutralise spreadsheet formula injection: a cell starting with = + - @ (or a
  // control char) can execute in Excel/Sheets. Prefix with a single quote.
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function csvRow(cells: (string | number)[]): string {
  return cells.map(csvCell).join(",");
}

/** MYP: conservative pass is the default (matches review, report and Excel). */
function mypPoints(content: GradingQuestion): number {
  return content.finalPoints ?? content.conservativePoints ?? content.proposedPoints ?? 0;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const assessmentId = Number(id);
  const assessment = getAssessment(assessmentId);
  if (!assessment) {
    return new Response("Assessment not found", { status: 404 });
  }

  const isDp = assessment.programme === "DP";
  const isTest = isFmTest(assessment);
  const questions = listQuestions(assessmentId);
  const submissions = listSubmissions(assessmentId).filter((s) => s.status !== "absent");

  const header = [
    "Student",
    ...questions.map((q) => `Q${q.number}`),
    "Total",
    ...(isDp ? ["%", "Grade"] : isTest ? ["Out of"] : ["Level(s)"]),
    "Missed Learning Targets",
  ];
  const rows: string[] = [csvRow(header)];

  for (const submission of submissions) {
    const student = submission.student_id ? getStudent(submission.student_id) : undefined;
    const studentName = student?.name ?? "(unassigned)";
    const gradingByQuestion = new Map(listGradings(submission.id).map((g) => [g.question_id, g.content]));

    let total = 0;
    const missedTargets = new Set<string>();
    const pointsCells: (string | number)[] = questions.map((q) => {
      const content = gradingByQuestion.get(q.id);
      if (!content) return "";
      const points = isDp
        ? sumQuestionMarks(content as unknown as DpGradingQuestion, q.dp_scheme, pickFinal)
        : mypPoints(content as GradingQuestion);
      total += points;
      if (q.max_points > 0 && points / q.max_points < 0.5 && q.learning_target_id) {
        const target = getLearningTarget(q.learning_target_id);
        if (target) missedTargets.add(target.name);
      }
      return points;
    });

    const tail: (string | number)[] = [];
    if (isDp) {
      const r = getDpResult(submission.id);
      tail.push(r ? `${r.pct.toFixed(0)}%` : "", r ? String(r.grade_final ?? r.grade) : "");
    } else if (isTest) {
      // A modified student sits fewer questions, so the total they were marked out of varies.
      tail.push(testScore(assessment, submission)?.max ?? "");
    } else {
      tail.push(
        listCriterionLevels(submission.id)
          .map((cl) => `${cl.criterion}:${cl.level_final ?? cl.level_conservative}`)
          .join(", ")
      );
    }

    rows.push(csvRow([studentName, ...pointsCells, total, ...tail, Array.from(missedTargets).join("; ")]));
  }

  const csv = rows.join("\n");
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${assessment.title.replace(/[^a-z0-9]+/gi, "-")}-grades.csv"`,
    },
  });
}
