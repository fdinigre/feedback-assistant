// Downloadable .xlsx templates for the external-data import flow (F2 extension).
// These are a convenience for the teacher's real exports — the import itself
// accepts arbitrary column layouts, so the template is not enforced on upload.

import ExcelJS from "exceljs";
import type { ExternalDataSource } from "@/lib/types";

export const runtime = "nodejs";

const TEMPLATE_COLUMNS: Record<ExternalDataSource, string[]> = {
  MAP: [
    "Name",
    "Achievement Percentile",
    "Overall RIT",
    "Percentile Band",
    "Met Growth",
    "Operations and Algebraic Thinking",
    "Number Systems",
    "Geometry",
    "Statistics and Probability",
  ],
  CAT4: ["Name", "Mean SAS", "Non-verbal SAS", "Quantitative SAS", "Spatial SAS", "Verbal SAS"],
  // A grade belongs to one semester of one school year, and the final grade is
  // what gets reported — all three were being carried in ad-hoc columns before.
  PRIOR_GRADES: [
    "Name",
    "Criterion A",
    "Criterion B",
    "Criterion C",
    "Criterion D",
    "Final grade",
    "Semester",
    "School year",
  ],
  ATL: [
    "Name",
    "Positive attitude and perseverance",
    "Completes learning",
    "Participates in class learning",
  ],
};

// One filled-in row, so the shape of each column is unmistakable — a semester is
// 1 or 2, a school year spans two of them. The teacher overwrites or deletes it.
const TEMPLATE_EXAMPLE: Partial<Record<ExternalDataSource, Record<string, string>>> = {
  PRIOR_GRADES: {
    Name: "Jane Doe",
    "Criterion A": "6",
    "Criterion B": "5",
    "Criterion C": "6",
    "Criterion D": "4",
    "Final grade": "5",
    Semester: "1",
    "School year": "2025-26",
  },
};

const TEMPLATE_FILENAMES: Record<ExternalDataSource, string> = {
  MAP: "map-template.xlsx",
  CAT4: "cat4-template.xlsx",
  PRIOR_GRADES: "prior-year-grades-template.xlsx",
  ATL: "atl-template.xlsx",
};

function isExternalDataSource(value: string): value is ExternalDataSource {
  return value === "MAP" || value === "CAT4" || value === "PRIOR_GRADES" || value === "ATL";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ source: string }> }
) {
  const { source: rawSource } = await params;
  if (!isExternalDataSource(rawSource)) {
    return new Response("Unknown source", { status: 404 });
  }

  const columns = TEMPLATE_COLUMNS[rawSource];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MYP Feedback Assistant";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Template");
  sheet.columns = columns.map((label) => ({ header: label, key: label, width: Math.max(16, label.length + 2) }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD9E1F2" },
  };

  // One example row to show the expected shape; the teacher deletes/overwrites it.
  const example = TEMPLATE_EXAMPLE[rawSource];
  sheet.addRow(
    Object.fromEntries(
      columns.map((c) => [c, example?.[c] ?? (c === "Name" ? "Jane Doe" : "")])
    )
  );

  // Semester is one of two values, so the spreadsheet itself can say so — a
  // dropdown on the column rather than a note somewhere the teacher has to read.
  const semester = columns.indexOf("Semester");
  if (semester >= 0) {
    for (let row = 2; row <= 200; row++) {
      sheet.getCell(row, semester + 1).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ['"1,2"'],
        showErrorMessage: true,
        errorTitle: "Semester",
        error: "Enter 1 or 2.",
      };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${TEMPLATE_FILENAMES[rawSource]}"`,
    },
  });
}
