import { listLearningTargets, listQuestions, listSubmissions } from "@/lib/db/queries";
import { computeCompleteness } from "@/lib/assessment/completeness";
import { isParseApproved } from "@/lib/assessment/dp-paths";
import type { AssessmentRow } from "@/lib/types";
import { NameMaskEditor } from "./NameMaskEditor";
import { DpFileUpload } from "./DpFileUpload";
import { DpParseSection } from "./DpParseSection";
import { DpCoverTargets } from "./DpCoverTargets";
import { DpBoundariesForm } from "./DpBoundariesForm";
import { uploadDpMarkscheme, uploadDpPaper } from "../actions";
import { getDefaultDpBoundaries } from "@/lib/assessment/dp-boundaries";
import { paperPreviewPageCount } from "@/lib/assessment/paper-preview";

/**
 * DP branch of the assessment setup screen. Entirely separate render path from the MYP setup
 * page — nothing here is shared with (or can affect) app/assessments/[id]/setup/page.tsx's MYP
 * markup.
 */
export function DpSetup({ assessment }: { assessment: AssessmentRow }) {
  const questions = listQuestions(assessment.id);
  const learningTargets = listLearningTargets(assessment.grade);
  const completeness = computeCompleteness(assessment.id);
  const parseApproved = isParseApproved(assessment.id);
  const defaultBoundaries = getDefaultDpBoundaries(assessment.id);
  const totalMarks = questions.reduce((sum, q) => sum + q.max_points, 0);

  return (
    <div className="max-w-3xl pb-16">
      <div className="mt-4 rounded-md border border-slate-200 p-4">
        {completeness.ready ? (
          <p className="text-sm font-medium text-emerald-700">
            Setup complete — status is &ldquo;ready&rdquo;.
          </p>
        ) : (
          <div>
            <p className="text-sm font-medium text-amber-700">Still missing:</p>
            <ul className="mt-1 list-inside list-disc text-sm text-amber-700">
              {completeness.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Paper + markscheme uploads */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Paper &amp; markscheme</h2>
        <p className="mt-1 text-sm text-slate-600">
          Upload the exam paper and the official markscheme as separate files (PDF or .docx).
          The markscheme is the source of truth for total marks — it should already be edited
          down to the sub-parts actually covered.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DpFileUpload
            label="Exam paper"
            hint="Used to extract the cover-page learning targets."
            currentPath={assessment.paper_file}
            action={uploadDpPaper.bind(null, assessment.id)}
          />
          <DpFileUpload
            label="Official markscheme"
            hint="Parsed into questions, sub-parts, and marks below."
            currentPath={assessment.markscheme_file}
            action={uploadDpMarkscheme.bind(null, assessment.id)}
          />
        </div>
      </section>

      {/* Markscheme parse + editor */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Markscheme parse</h2>
          <span className="text-sm text-slate-600">Total: {totalMarks} marks</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Preserves IB notation exactly: M/A/R codes, implied marks (in parentheses), follow-through
          (ft), alternative methods (METHOD 1/2, EITHER…OR), and binding Note boxes.
        </p>
        <DpParseSection
          assessmentId={assessment.id}
          questions={questions}
          hasMarkscheme={!!assessment.markscheme_file}
          parseApproved={parseApproved}
        />
      </section>

      {/* Learning targets */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Learning targets (cover page)</h2>
        <p className="mt-1 text-sm text-slate-600">
          Recommended, not required to activate the assessment.
        </p>
        <DpCoverTargets
          assessmentId={assessment.id}
          coverTargets={assessment.cover_targets}
          questions={questions}
          learningTargets={learningTargets}
          hasPaper={!!assessment.paper_file}
        />
      </section>

      {/* Grade boundaries */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Grade boundaries</h2>
        <p className="mt-1 text-sm text-slate-600">
          Percentage floor for each grade 1–7. A percentage exactly on a floor belongs to that
          (higher) band.
        </p>
        <DpBoundariesForm
          assessmentId={assessment.id}
          boundaries={assessment.boundaries}
          defaults={defaultBoundaries}
        />
      </section>

      {/* Name mask */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Name mask</h2>
        <p className="mt-1 text-sm text-slate-600">
          Defines the region blacked out before a scan is sent to the AI — same as MYP scans. Page 1
          is required; add a second page if the name is repeated there.
        </p>
        {(() => {
          const preview = listSubmissions(assessment.id).find((s) => (s.page_count ?? 0) >= 1) ?? null;
          return (
            <NameMaskEditor
              assessmentId={assessment.id}
              masks={assessment.name_masks}
              paperPageCount={paperPreviewPageCount(assessment.id, assessment.paper_file)}
              previewSubmissionId={preview?.id ?? null}
              previewPageCount={preview?.page_count ?? 0}
            />
          );
        })()}
      </section>
    </div>
  );
}
