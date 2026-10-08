import ExcelJS from "exceljs";
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
import { pickFinal, sumQuestionMarks } from "@/lib/submissions/dp-calc";
import { listDpGradings } from "@/lib/submissions/dp-grading";
import type { AssessmentRow } from "@/lib/types";

export const runtime = "nodejs";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFD9E1F2" },
};

const ABSENT_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE0E0E0" },
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
};

function safeFilename(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
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

  if (assessment.programme === "DP") {
    return buildDpXlsxResponse(assessment);
  }

  const questions = listQuestions(assessmentId);
  const allSubmissions = listSubmissions(assessmentId);
  const totalMax = questions.reduce((sum, q) => sum + q.max_points, 0);
  const criteria = assessment.criteria;

  // ---------------------------------------------------------------------
  // Build one row-model per submission (only submissions with an assigned
  // student are represented in the sheet at all).
  // ---------------------------------------------------------------------
  type Row = {
    studentName: string;
    absent: boolean;
    pointsByQuestion: (number | null)[];
    total: number | null;
    criterionValues: Map<string, { proposed: number; final: number; conservative: number }>;
    missedTargets: string[];
  };

  const rows: Row[] = [];

  for (const submission of allSubmissions) {
    if (!submission.student_id) continue;
    const student = getStudent(submission.student_id);
    if (!student) continue;

    if (submission.status === "absent") {
      rows.push({
        studentName: student.name,
        absent: true,
        pointsByQuestion: questions.map(() => null),
        total: null,
        criterionValues: new Map(),
        missedTargets: [],
      });
      continue;
    }

    const gradingByQuestion = new Map(
      listGradings(submission.id).map((g) => [g.question_id, g.content])
    );

    let total = 0;
    let hasAnyGrade = false;
    const missedTargets = new Set<string>();
    const pointsByQuestion = questions.map((q) => {
      const content = gradingByQuestion.get(q.id);
      if (!content) return null;
      // Conservative pass as the default (benchmark: closer to the teacher's marks).
      const points = content.finalPoints ?? content.conservativePoints;
      hasAnyGrade = true;
      total += points;
      if (q.max_points > 0 && points / q.max_points < 0.5 && q.learning_target_id) {
        const target = getLearningTarget(q.learning_target_id);
        if (target) missedTargets.add(target.name);
      }
      return points;
    });

    const criterionValues = new Map<
      string,
      { proposed: number; final: number; conservative: number }
    >();
    for (const cl of listCriterionLevels(submission.id)) {
      criterionValues.set(cl.criterion, {
        proposed: cl.level_proposed,
        final: cl.level_final ?? cl.level_conservative,
        conservative: cl.level_conservative,
      });
    }

    rows.push({
      studentName: student.name,
      absent: false,
      pointsByQuestion,
      total: hasAnyGrade ? total : null,
      criterionValues,
      missedTargets: Array.from(missedTargets),
    });
  }

  rows.sort((a, b) => a.studentName.localeCompare(b.studentName));
  const presentRows = rows.filter((r) => !r.absent);
  const absentRows = rows.filter((r) => r.absent);

  // ---------------------------------------------------------------------
  // Workbook / worksheet setup
  // ---------------------------------------------------------------------
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MYP Feedback Assistant";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Results", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  // Note: we deliberately do NOT use ExcelJS's `header` column property —
  // it auto-writes labels into row 1, which we need for the merged title
  // row instead (merging clears the non-anchor cells' values). Header
  // labels are written manually into row 2 below.
  type ColumnDef = { label: string; key: string; width: number };
  const columnDefs: ColumnDef[] = [
    { label: "Student", key: "student", width: 24 },
    ...questions.map((q) => ({
      label: `Q${q.number} /${q.max_points}`,
      key: `q_${q.id}`,
      width: 12,
    })),
    { label: `Total /${totalMax}`, key: "total", width: 12 },
  ];
  for (const criterion of criteria) {
    columnDefs.push({
      label: `Level ${criterion} (proposed)`,
      key: `crit_${criterion}_proposed`,
      width: 18,
    });
    columnDefs.push({
      label: `Level ${criterion} (final)`,
      key: `crit_${criterion}_final`,
      width: 18,
    });
  }
  columnDefs.push({ label: "Missed Learning Targets", key: "missed", width: 36 });
  sheet.columns = columnDefs.map(({ key, width }) => ({ key, width }));

  const columnCount = columnDefs.length;

  // Row 1: title
  const dateLabel = assessment.date ?? "(no date)";
  sheet.mergeCells(1, 1, 1, columnCount);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `${assessment.title} — ${dateLabel}`;
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 26;

  // Row 2: header labels, written explicitly
  const headerRow = sheet.getRow(2);
  columnDefs.forEach((col, i) => {
    headerRow.getCell(i + 1).value = col.label;
  });
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = THIN_BORDER;
  });
  headerRow.height = 30;
  headerRow.commit();

  // Data rows
  const questionSums = questions.map(() => 0);
  const questionCounts = questions.map(() => 0);
  let totalSum = 0;
  let totalCount = 0;

  for (const row of presentRows) {
    const rowValues: Record<string, unknown> = { student: row.studentName };
    row.pointsByQuestion.forEach((points, i) => {
      const key = `q_${questions[i].id}`;
      rowValues[key] = points;
      if (points !== null) {
        questionSums[i] += points;
        questionCounts[i] += 1;
      }
    });
    rowValues.total = row.total;
    if (row.total !== null) {
      totalSum += row.total;
      totalCount += 1;
    }
    for (const criterion of criteria) {
      const cv = row.criterionValues.get(criterion);
      rowValues[`crit_${criterion}_proposed`] = cv ? cv.proposed : null;
      rowValues[`crit_${criterion}_final`] = cv ? cv.final : null;
    }
    rowValues.missed = row.missedTargets.join(", ");

    const excelRow = sheet.addRow(rowValues);
    excelRow.eachCell({ includeEmpty: false }, (cell) => {
      cell.border = THIN_BORDER;
    });

    // Numeric formatting for question / total / level columns
    questions.forEach((q) => {
      const cell = excelRow.getCell(`q_${q.id}`);
      cell.numFmt = "0.##";
    });
    excelRow.getCell("total").numFmt = "0.##";

    for (const criterion of criteria) {
      const cv = row.criterionValues.get(criterion);
      const finalCell = excelRow.getCell(`crit_${criterion}_final`);
      if (cv && cv.conservative !== cv.final) {
        finalCell.note = `Conservative estimate: Level ${cv.conservative}`;
      }
    }
  }

  // Absent rows
  for (const row of absentRows) {
    const excelRow = sheet.addRow({ student: row.studentName });
    sheet.mergeCells(excelRow.number, 2, excelRow.number, columnCount);
    const absentCell = excelRow.getCell(2);
    absentCell.value = "ABSENT";
    absentCell.alignment = { horizontal: "center", vertical: "middle" };
    for (let c = 1; c <= columnCount; c++) {
      const cell = excelRow.getCell(c);
      cell.fill = ABSENT_FILL;
      cell.font = { italic: true, color: { argb: "FF666666" } };
    }
  }

  // Summary row: class averages
  const avgRowValues: Record<string, unknown> = {
    student: "Class average",
  };
  questions.forEach((q, i) => {
    avgRowValues[`q_${q.id}`] = questionCounts[i] > 0 ? questionSums[i] / questionCounts[i] : null;
  });
  avgRowValues.total = totalCount > 0 ? totalSum / totalCount : null;
  const avgRow = sheet.addRow(avgRowValues);
  avgRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.border = { top: { style: "thin", color: { argb: "FF000000" } } };
  });
  questions.forEach((q) => {
    avgRow.getCell(`q_${q.id}`).numFmt = "0.##";
  });
  avgRow.getCell("total").numFmt = "0.##";

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeFilename(assessment.title)}-results.xlsx"`,
    },
  });
}

// ---------------------------------------------------------------------------
// DP export — single "DP Results" sheet: one row per student with marks per
// question, total, %, grade 1-7 (+ grade_final if the teacher adjusted it in
// review), plus per-learning-target performance (obtained/possible marks,
// via the question -> learning target mapping). Absent rows shaded, same
// pattern as MYP.
// ---------------------------------------------------------------------------

async function buildDpXlsxResponse(assessment: AssessmentRow): Promise<Response> {
  const questions = listQuestions(assessment.id);
  const allSubmissions = listSubmissions(assessment.id);
  const totalMax = questions.reduce((sum, q) => sum + q.max_points, 0);

  const targetIds = Array.from(
    new Set(questions.map((q) => q.learning_target_id).filter((id): id is number => id !== null))
  );
  const targets = targetIds
    .map((id) => ({ id, target: getLearningTarget(id) }))
    .filter((t): t is { id: number; target: NonNullable<ReturnType<typeof getLearningTarget>> } =>
      t.target !== undefined
    );

  type Row = {
    studentName: string;
    absent: boolean;
    pointsByQuestion: (number | null)[];
    total: number | null;
    pct: number | null;
    grade: number | null;
    gradeFinal: number | null;
    targetValues: Map<number, { obtained: number; possible: number }>;
  };

  const rows: Row[] = [];

  for (const submission of allSubmissions) {
    if (!submission.student_id) continue;
    const student = getStudent(submission.student_id);
    if (!student) continue;

    if (submission.status === "absent") {
      rows.push({
        studentName: student.name,
        absent: true,
        pointsByQuestion: questions.map(() => null),
        total: null,
        pct: null,
        grade: null,
        gradeFinal: null,
        targetValues: new Map(),
      });
      continue;
    }

    const gradingByQuestion = new Map(
      listDpGradings(submission.id).map((g) => [g.question_id, g.content])
    );
    const dpResult = getDpResult(submission.id);

    const targetValues = new Map<number, { obtained: number; possible: number }>();
    for (const t of targets) targetValues.set(t.id, { obtained: 0, possible: 0 });

    let hasAnyGrade = false;
    let fallbackTotal = 0;
    const pointsByQuestion = questions.map((q) => {
      const content = gradingByQuestion.get(q.id);
      if (!content) return null;
      hasAnyGrade = true;
      // The decided marks, matching the review screen and the stored grade.
      const points = sumQuestionMarks(content, q.dp_scheme, pickFinal);
      fallbackTotal += points;
      if (q.learning_target_id && targetValues.has(q.learning_target_id)) {
        const tv = targetValues.get(q.learning_target_id)!;
        tv.obtained += points;
        tv.possible += q.max_points;
      }
      return points;
    });

    rows.push({
      studentName: student.name,
      absent: false,
      pointsByQuestion,
      total: dpResult ? dpResult.total_marks : hasAnyGrade ? fallbackTotal : null,
      pct: dpResult ? dpResult.pct : null,
      grade: dpResult ? dpResult.grade : null,
      gradeFinal: dpResult?.grade_final ?? null,
      targetValues,
    });
  }

  rows.sort((a, b) => a.studentName.localeCompare(b.studentName));
  const presentRows = rows.filter((r) => !r.absent);
  const absentRows = rows.filter((r) => r.absent);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MYP Feedback Assistant";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("DP Results", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  type ColumnDef = { label: string; key: string; width: number };
  const columnDefs: ColumnDef[] = [
    { label: "Student", key: "student", width: 24 },
    ...questions.map((q) => ({
      label: `Q${q.number} /${q.max_points}`,
      key: `q_${q.id}`,
      width: 12,
    })),
    { label: `Total /${totalMax}`, key: "total", width: 12 },
    { label: "%", key: "pct", width: 10 },
    { label: "Grade (1-7)", key: "grade", width: 12 },
    { label: "Grade (final)", key: "gradeFinal", width: 13 },
  ];
  for (const t of targets) {
    columnDefs.push({ label: `${t.target.name} — obtained`, key: `target_${t.id}_obtained`, width: 22 });
    columnDefs.push({ label: `${t.target.name} — possible`, key: `target_${t.id}_possible`, width: 22 });
  }
  sheet.columns = columnDefs.map(({ key, width }) => ({ key, width }));
  const columnCount = columnDefs.length;

  const dateLabel = assessment.date ?? "(no date)";
  sheet.mergeCells(1, 1, 1, columnCount);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `${assessment.title} — ${dateLabel}`;
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 26;

  const headerRow = sheet.getRow(2);
  columnDefs.forEach((col, i) => {
    headerRow.getCell(i + 1).value = col.label;
  });
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = THIN_BORDER;
  });
  headerRow.height = 30;
  headerRow.commit();

  for (const row of presentRows) {
    const rowValues: Record<string, unknown> = { student: row.studentName };
    row.pointsByQuestion.forEach((points, i) => {
      rowValues[`q_${questions[i].id}`] = points;
    });
    rowValues.total = row.total;
    rowValues.pct = row.pct !== null ? Math.round(row.pct * 10) / 10 : null;
    rowValues.grade = row.grade;
    rowValues.gradeFinal = row.gradeFinal;
    for (const t of targets) {
      const tv = row.targetValues.get(t.id);
      rowValues[`target_${t.id}_obtained`] = tv ? tv.obtained : null;
      rowValues[`target_${t.id}_possible`] = tv ? tv.possible : null;
    }

    const excelRow = sheet.addRow(rowValues);
    excelRow.eachCell({ includeEmpty: false }, (cell) => {
      cell.border = THIN_BORDER;
    });

    questions.forEach((q) => {
      excelRow.getCell(`q_${q.id}`).numFmt = "0.##";
    });
    excelRow.getCell("total").numFmt = "0.##";
    excelRow.getCell("pct").numFmt = "0.0";

    if (row.grade !== null && row.gradeFinal !== null && row.grade !== row.gradeFinal) {
      excelRow.getCell("gradeFinal").note = `First-pass grade: ${row.grade}`;
    }
  }

  for (const row of absentRows) {
    const excelRow = sheet.addRow({ student: row.studentName });
    sheet.mergeCells(excelRow.number, 2, excelRow.number, columnCount);
    const absentCell = excelRow.getCell(2);
    absentCell.value = "ABSENT";
    absentCell.alignment = { horizontal: "center", vertical: "middle" };
    for (let c = 1; c <= columnCount; c++) {
      const cell = excelRow.getCell(c);
      cell.fill = ABSENT_FILL;
      cell.font = { italic: true, color: { argb: "FF666666" } };
    }
  }

  const questionSums = questions.map(() => 0);
  const questionCounts = questions.map(() => 0);
  let totalSum = 0;
  let totalCount = 0;
  for (const row of presentRows) {
    row.pointsByQuestion.forEach((points, i) => {
      if (points !== null) {
        questionSums[i] += points;
        questionCounts[i] += 1;
      }
    });
    if (row.total !== null) {
      totalSum += row.total;
      totalCount += 1;
    }
  }
  const avgRowValues: Record<string, unknown> = { student: "Class average" };
  questions.forEach((q, i) => {
    avgRowValues[`q_${q.id}`] = questionCounts[i] > 0 ? questionSums[i] / questionCounts[i] : null;
  });
  avgRowValues.total = totalCount > 0 ? totalSum / totalCount : null;
  const avgRow = sheet.addRow(avgRowValues);
  avgRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.border = { top: { style: "thin", color: { argb: "FF000000" } } };
  });
  questions.forEach((q) => {
    avgRow.getCell(`q_${q.id}`).numFmt = "0.##";
  });
  avgRow.getCell("total").numFmt = "0.##";

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeFilename(assessment.title)}-dp-results.xlsx"`,
    },
  });
}
