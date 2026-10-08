import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAssessment,
  getMarksSheet,
  getReport,
  getStudent,
  hasErrorTags,
  hasSkillTags,
  listClasses,
  listQuestions,
  listStudents,
  listSubmissions,
} from "@/lib/db/queries";
import type { StudentRow, SubmissionRow, SubmissionStatus } from "@/lib/types";
import {
  findDuplicateSubmissionIds,
  warningsWithoutMissingNameMask,
} from "@/lib/intake/batch";
import { Breadcrumb } from "@/app/_components/Breadcrumb";
import { warningFix } from "@/lib/intake/warning-fix";
import { assignStudent, markAbsent, saveScratchPages, undoAbsent } from "./actions";
import { DpSubmissionPipeline } from "./_components/DpSubmissionPipeline";
import { RunAllPipeline, type BatchItem } from "./_components/RunAllPipeline";
import { isFmTest } from "@/lib/assessment/course";
import { ApproveAllReports } from "./_components/ApproveAllReports";
import { MarksImport } from "./_components/MarksImport";
import { GradesTable } from "./_components/GradesTable";
import { buildGradesTable } from "@/lib/assessment/grades-table";
import { listSheetDifferences } from "@/lib/marks-import/pending";
import { DeleteSubmissionButton } from "./_components/DeleteSubmissionButton";

const DP_TYPE_LABEL: Record<string, string> = {
  quiz: "Quiz (formative)",
  unit_test: "Unit test (summative)",
};

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  uploaded: "Uploaded",
  assigned: "Assigned",
  transcribed: "Transcribed",
  graded: "Graded",
  reviewed: "Reviewed",
  absent: "Absent",
};

// Statuses at or beyond "assigned" get a Review link (spec item 6).
const REVIEW_ELIGIBLE: SubmissionStatus[] = [
  "assigned",
  "transcribed",
  "graded",
  "reviewed",
];

type FailedUpload = { filename: string; error: string };

export default async function SubmissionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ uploaded?: string; failed?: string }>;
}) {
  const { id } = await params;
  const assessmentId = Number(id);
  const assessment = Number.isInteger(assessmentId) ? getAssessment(assessmentId) : undefined;
  if (!assessment) notFound();

  const { uploaded: uploadedRaw, failed: failedRaw } = await searchParams;
  const uploadedCount = uploadedRaw ? Number(uploadedRaw) : 0;
  let failedUploads: FailedUpload[] = [];
  if (failedRaw) {
    try {
      failedUploads = JSON.parse(failedRaw) as FailedUpload[];
    } catch {
      failedUploads = [];
    }
  }

  const submissions = listSubmissions(assessmentId);
  // An assessment belongs to exactly one class, so only that class's students
  // can be assigned a scan or marked absent. Rows created before assessments
  // were class-scoped have class_id NULL and keep the old grade-wide roster.
  const allClasses = listClasses();
  const classes =
    assessment.class_id !== null
      ? allClasses.filter((c) => c.id === assessment.class_id)
      : allClasses.filter((c) => c.grade === assessment.grade);
  const classGroups = classes.map((cls) => ({ cls, students: listStudents(cls.id) }));
  const studentById = new Map<number, StudentRow & { className: string }>();
  for (const group of classGroups) {
    for (const student of group.students) {
      studentById.set(student.id, { ...student, className: group.cls.name });
    }
  }

  const pdfSubmissions = submissions.filter((s): s is SubmissionRow & { pdf_path: string } => s.pdf_path !== null);
  const absentSubmissions = submissions.filter((s) => s.status === "absent");
  const assignedStudentIds = new Set(
    submissions.filter((s) => s.student_id !== null).map((s) => s.student_id as number)
  );
  const absentCandidates = [...studentById.values()].filter((s) => !assignedStudentIds.has(s.id));

  const duplicateIds = findDuplicateSubmissionIds(submissions);

  // Marks on the teacher's uploaded sheet that still disagree with the app's.
  const sheetDifferences = assessment.programme !== "DP" ? listSheetDifferences(assessmentId) : [];
  const marksSheet = assessment.programme !== "DP" ? (getMarksSheet(assessmentId) ?? null) : null;
  const differenceCount = new Map<number, number>();
  for (const d of sheetDifferences) {
    if (d.status !== "waiting") continue;
    differenceCount.set(d.submissionId, (differenceCount.get(d.submissionId) ?? 0) + 1);
  }

  // The "no name mask configured" warning is stamped on a submission when it is
  // uploaded. Configuring a mask afterwards goes back and masks those earlier
  // scans, so once the assessment has any mask the stored warning is stale and
  // must not be shown — it would claim, wrongly, that page 1 is unmasked.
  const hasNameMask = assessment.name_masks.length > 0;
  const visibleWarnings = (warnings: string[] | null): string[] =>
    hasNameMask ? warningsWithoutMissingNameMask(warnings) : (warnings ?? []);

  // Batch pipeline: every submission that has a student assigned and isn't absent or a duplicate.
  const batchItems: BatchItem[] = submissions
    .filter(
      (s) =>
        s.student_id !== null &&
        s.status !== "absent" &&
        s.pdf_path !== null &&
        !duplicateIds.has(s.id)
    )
    .map((s) => ({
      submissionId: s.id,
      studentName: getStudent(s.student_id as number)?.name ?? `Submission ${s.id}`,
      status: s.status,
      hasReport: getReport(s.id) !== undefined,
      // Sorted means both passes: mistake kinds and the core skills under them.
      hasErrorTags: hasErrorTags(s.id) && hasSkillTags(s.id),
    }));

  return (
    <div>
      <Breadcrumb
        items={[
          { label: "Assessments", href: "/assessments" },
          { label: assessment.title, href: `/assessments/${assessment.id}` },
          { label: "Submissions" },
        ]}
      />
      <h1 className="text-2xl font-semibold tracking-tight">{assessment.title} — Submissions</h1>
      <p className="mt-2 text-slate-600">
        Upload one scanned PDF per student, assign each to a roster student, and mark absences.
      </p>

      {assessment.programme === "DP" && (
        <p className="mt-2 text-sm text-slate-600">
          {DP_TYPE_LABEL[assessment.assessment_type ?? ""] ?? assessment.assessment_type} ·{" "}
          {listQuestions(assessmentId).reduce((sum, q) => sum + q.max_points, 0)} marks total ·{" "}
          {assessment.boundaries ? (
            `${assessment.boundaries.length} grade boundaries set`
          ) : (
            <Link href={`/assessments/${assessmentId}/setup`} className="text-amber-700 underline underline-offset-2">
              no grade boundaries yet
            </Link>
          )}
        </p>
      )}

      {/* Whole-class exports belong here, with the class in front of you — they
          used to sit on each individual student's review page, where they read
          as if they applied only to that student. */}
      {(() => {
        const reportCount = batchItems.filter((b) => b.hasReport).length;
        const draftReports = submissions.filter((s) => {
          const r = getReport(s.id);
          return r !== undefined && r.status !== "approved";
        }).length;
        const hasMarking = submissions.some((s) => s.status === "graded" || s.status === "reviewed");
        if (!hasMarking && reportCount === 0) return null;
        return (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <span className="text-sm font-medium text-slate-700">Export for the whole class:</span>
            <a
              href={`/api/export/assessment/${assessment.id}/xlsx`}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100"
            >
              Spreadsheet (Excel)
            </a>
            {assessment.programme !== "DP" && (
              <a
                href={`/api/export/assessment/${assessment.id}/csv`}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100"
              >
                CSV
              </a>
            )}
            <a
              href={`/api/export/assessment/${assessment.id}/reports`}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100"
            >
              Reports (per student, .zip)
            </a>
            {reportCount > 0 && (
              <a
                href={`/api/export/assessment/${assessment.id}/toddle`}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100"
              >
                Toddle comments + levels (one document)
              </a>
            )}
            {reportCount > 0 && (
              <a
                href={`/api/export/assessment/${assessment.id}/toddle-pages`}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100"
                title="A Word document with each student's Toddle comment on its own page, without grades"
              >
                Toddle comments, one student per page (Word)
              </a>
            )}
            <span className="text-xs text-slate-500">
              {reportCount === 0
                ? "No reports generated yet"
                : `${reportCount} report${reportCount === 1 ? "" : "s"} ready`}
            </span>
            <ApproveAllReports assessmentId={assessment.id} draftCount={draftReports} />
          </div>
        );
      })()}

      {/* The class's grades side by side, to read against her own markbook in
          one view once papers are marked — rather than opening them one by one. */}
      {(() => {
        const grades = buildGradesTable(assessment);
        if (grades.marked === 0) return null;
        return (
          <section className="mt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">Grades</h2>
              <span className="text-sm text-slate-500">
                {grades.marked === grades.total
                  ? `All ${grades.total} marked`
                  : `${grades.marked} of ${grades.total} marked`}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Every student&rsquo;s grade on this assessment, to check against your own markbook. A
              name opens that paper.
              {grades.kind === "summary" &&
                " These grades are worked out from the marks, so to change one, change the marks on the paper."}
            </p>
            <div className="mt-3">
              <GradesTable table={grades} />
            </div>
          </section>
        );
      })()}

      {submissions.some((s) => s.student_id !== null && s.status !== "absent") &&
        assessment.programme !== "DP" && (
          <MarksImport
            assessmentId={assessment.id}
            classId={assessment.class_id}
            pointsOnly={isFmTest(assessment)}
            sheet={
              marksSheet && {
                fileName: marksSheet.file_name,
                uploadedAt: marksSheet.uploaded_at,
                summary: marksSheet.summary,
              }
            }
            differences={sheetDifferences}
          />
        )}

      {uploadedCount > 0 && (
        <p className="mt-4 rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
          {uploadedCount} file{uploadedCount === 1 ? "" : "s"} uploaded successfully.
        </p>
      )}
      {failedUploads.length > 0 && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-medium">{failedUploads.length} file(s) failed to upload:</p>
          <ul className="mt-1 list-inside list-disc">
            {failedUploads.map((f) => (
              <li key={f.filename}>
                <span className="font-medium">{f.filename}</span>: {f.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      <RunAllPipeline items={batchItems} programme={assessment.programme} />

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Upload PDFs</h2>
        <form
          action="/api/intake/upload"
          method="POST"
          encType="multipart/form-data"
          className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-4"
        >
          <input type="hidden" name="assessmentId" value={assessmentId} />
          <input
            type="file"
            name="files"
            accept="application/pdf"
            multiple
            required
            className="text-sm text-slate-700"
          />
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Upload batch
          </button>
        </form>
      </section>

      {/* Anchored: "no student assigned" on a review page links here. */}
      <section id="assignment" className="mt-10 scroll-mt-4">
        <h2 className="text-lg font-semibold">Assignment</h2>
        {pdfSubmissions.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No PDFs uploaded yet.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {pdfSubmissions.map((s) => {
              const filename = path.basename(s.pdf_path);
              const isDuplicate = duplicateIds.has(s.id);
              const student = s.student_id !== null ? studentById.get(s.student_id) : undefined;
              const showReview = REVIEW_ELIGIBLE.includes(s.status) && !isDuplicate;

              return (
                <div key={s.id} className="rounded-md border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/pages/${s.id}/1`}
                      alt={`First page of ${filename}`}
                      className="h-32 w-auto rounded border border-slate-200 object-contain"
                    />

                    <div className="flex-1 min-w-[240px]">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{filename}</span>
                        <StatusChip status={s.status} />
                        <span className="ml-auto">
                          <DeleteSubmissionButton submissionId={s.id} filename={filename} />
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {s.page_count ?? "?"} page{s.page_count === 1 ? "" : "s"}
                      </p>

                      {isDuplicate && student && (
                        <p className="mt-2 rounded bg-amber-50 border border-amber-200 px-2 py-1 text-sm text-amber-800">
                          Duplicate: two PDFs assigned to {student.name}. Resolve before continuing.
                        </p>
                      )}
                      {visibleWarnings(s.warnings).map((w) => {
                        const fix = warningFix(w, assessmentId, s.id);
                        return (
                          <p
                            key={w}
                            className="mt-2 rounded bg-amber-50 border border-amber-200 px-2 py-1 text-sm text-amber-800"
                          >
                            {w}{" "}
                            <Link href={fix.href} className="font-medium underline underline-offset-2">
                              {fix.label}
                            </Link>
                          </p>
                        );
                      })}

                      <form action={assignStudent.bind(null, s.id)} className="mt-3 flex items-center gap-2">
                        <select
                          name="studentId"
                          defaultValue={s.student_id ?? ""}
                          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                        >
                          <option value="">— unassigned —</option>
                          {classGroups.map((group) => (
                            <optgroup key={group.cls.id} label={group.cls.name}>
                              {group.students.map((student) => (
                                <option key={student.id} value={student.id}>
                                  {student.name}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium hover:bg-slate-100"
                        >
                          Assign
                        </button>
                      </form>

                      {showReview && (
                        <Link
                          href={`/submissions/${s.id}`}
                          className="mt-3 inline-block text-sm font-medium text-slate-900 underline"
                        >
                          Review →
                        </Link>
                      )}
                      {showReview && (differenceCount.get(s.id) ?? 0) > 0 && (
                        <Link
                          href={`/submissions/${s.id}`}
                          className="ml-3 inline-block rounded bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800 hover:bg-rose-200"
                        >
                          {differenceCount.get(s.id)} differ
                          {differenceCount.get(s.id) === 1 ? "s" : ""} from your sheet
                        </Link>
                      )}

                      {assessment.programme === "DP" && showReview && (
                        <DpSubmissionPipeline submissionId={s.id} />
                      )}
                    </div>
                  </div>

                  {s.page_count !== null && s.page_count !== undefined && (
                    <ScratchPagesPanel submission={s} pageCount={s.page_count} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Anchored: the "marked absent" notice on a review page links here, to undo it. */}
      <section id="absent" className="mt-10 scroll-mt-4">
        <h2 className="text-lg font-semibold">Absent students</h2>
        <p className="mt-1 text-sm text-slate-500">
          Students with no submission for this assessment. Marking absent excludes them from batch
          processing and outputs, but records they were absent.
        </p>

        {absentSubmissions.length > 0 && (
          <ul className="mt-3 space-y-2">
            {absentSubmissions.map((s) => {
              const student = s.student_id !== null ? studentById.get(s.student_id) : undefined;
              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-4 py-2"
                >
                  <span>
                    {student?.name ?? "Unknown student"}{" "}
                    <span className="text-sm text-slate-500">({student?.className})</span> — marked
                    absent
                  </span>
                  <form action={undoAbsent.bind(null, s.id)}>
                    <button
                      type="submit"
                      className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium hover:bg-slate-100"
                    >
                      Undo
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        {absentCandidates.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {absentCandidates.map((student) => (
              <li
                key={student.id}
                className="flex items-center justify-between rounded-md border border-slate-200 px-4 py-2"
              >
                <span>
                  {student.name} <span className="text-sm text-slate-500">({student.className})</span>
                </span>
                <form action={markAbsent.bind(null, assessmentId, student.id)}>
                  <button
                    type="submit"
                    className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium hover:bg-slate-100"
                  >
                    Mark absent
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Every roster student has a submission.</p>
        )}
      </section>
    </div>
  );
}

function StatusChip({ status }: { status: SubmissionStatus }) {
  const colors: Record<SubmissionStatus, string> = {
    uploaded: "bg-slate-100 text-slate-700",
    assigned: "bg-blue-100 text-blue-800",
    transcribed: "bg-purple-100 text-purple-800",
    graded: "bg-indigo-100 text-indigo-800",
    reviewed: "bg-green-100 text-green-800",
    absent: "bg-red-100 text-red-800",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function ScratchPagesPanel({
  submission,
  pageCount,
}: {
  submission: SubmissionRow;
  pageCount: number;
}) {
  const scratchPages = new Set(submission.scratch_pages ?? []);
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <details className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
      <summary className="cursor-pointer text-sm font-medium text-slate-700">
        Pages ({pageCount}) — mark scratch pages
      </summary>
      <p className="mt-2 text-xs text-slate-500">
        Scratch pages are transcribed but not graded unless included.
      </p>
      <form action={saveScratchPages.bind(null, submission.id)} className="mt-3">
        <div className="flex flex-wrap gap-3">
          {pages.map((pageNum) => (
            <label
              key={pageNum}
              className="flex flex-col items-center gap-1 rounded border border-slate-200 bg-white p-2 text-xs"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/pages/${submission.id}/${pageNum}`}
                alt={`Page ${pageNum}`}
                className="h-24 w-auto object-contain"
              />
              <span>Page {pageNum}</span>
              <span className="flex items-center gap-1">
                <input
                  type="checkbox"
                  name="page"
                  value={pageNum}
                  defaultChecked={scratchPages.has(pageNum)}
                />
                Scratch
              </span>
            </label>
          ))}
        </div>
        <button
          type="submit"
          className="mt-3 rounded-md border border-slate-300 px-3 py-1 text-sm font-medium hover:bg-slate-100"
        >
          Save scratch pages
        </button>
      </form>
    </details>
  );
}
