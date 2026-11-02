import fs from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import {
  findOrCreateIaExploration,
  getClass,
  getStudent,
  listIaDeadlines,
  listIaDocuments,
  listIaOutputs,
  listIaProgress,
  listStudents,
  getIaItemMeanings,
} from "@/lib/db/queries";
import Link from "next/link";
import { Breadcrumb } from "@/app/_components/Breadcrumb";
import { dpCourseYear } from "@/lib/assessment/course";
import { TopicForm } from "./_components/TopicForm";
import { MilestoneList } from "./_components/MilestoneList";
import { UploadAndOutputsClient } from "./_components/UploadAndOutputsClient";
import { parseRubricItems } from "@/lib/ia/rubric-items";
import { locateTargets, type LocatedTarget } from "@/lib/ia/draft-view";
import { feedbackTargets } from "@/lib/ia/feedback-targets";
import { injectNameDraftFeedback } from "@/lib/ia/render";
import type { IaDraftFeedback } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ExplorationPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId: studentIdRaw } = await params;
  const studentId = Number(studentIdRaw);
  const student = Number.isFinite(studentId) ? getStudent(studentId) : undefined;
  if (!student) notFound();

  const cls = getClass(student.class_id);
  // Creates the exploration on first visit (spec: "cria ia_exploration on demand").
  const exploration = findOrCreateIaExploration(studentId);
  const progress = listIaProgress(exploration.id);
  const documents = listIaDocuments(exploration.id);
  const outputs = listIaOutputs(exploration.id);
  const deadlines = cls ? listIaDeadlines(cls.id) : [];

  let rubricText = "";
  try {
    rubricText = fs.readFileSync(
      path.join(process.cwd(), "specs", "reference", "exploration-rubric-sl-v1.4.txt"),
      "utf-8"
    );
  } catch {
    // no rubric file: the checklist simply doesn't show
  }
  const rubric = parseRubricItems(rubricText);

  // The latest draft's pages for the viewer, with every feedback quote located on
  // them (in the original PDF, on this computer). Word drafts have no viewer.
  let draftView: { documentId: number; pageCount: number; located: Record<string, LocatedTarget> } | null = null;
  const draftDoc = documents.find((d) => d.kind === "draft");
  if (draftDoc?.file_path && path.extname(draftDoc.file_path).toLowerCase() === ".pdf" && fs.existsSync(draftDoc.file_path)) {
    try {
      const latestFeedback = outputs.find((o) => o.kind === "draft_feedback");
      const fb = latestFeedback
        ? injectNameDraftFeedback(latestFeedback.content as IaDraftFeedback, student.name, student.pseudonym)
        : null;
      const { pageCount, located } = locateTargets(fs.readFileSync(draftDoc.file_path), feedbackTargets(fb));
      draftView = { documentId: draftDoc.id, pageCount, located };
    } catch {
      // an unreadable PDF: the feedback still shows, without the viewer
    }
  }

  // Previous / next student, in the same order as the class roster on the IA page.
  const classmates = cls ? listStudents(cls.id) : [];
  const at = classmates.findIndex((s) => s.id === studentId);
  const prev = at > 0 ? classmates[at - 1] : null;
  const next = at >= 0 && at < classmates.length - 1 ? classmates[at + 1] : null;

  const doneMap = Object.fromEntries(progress.map((p) => [p.milestone, p.completed_at]));
  const deadlineMap = Object.fromEntries(deadlines.map((d) => [d.milestone, d.due_date]));

  return (
    <div className="space-y-8 pb-16">
      <Breadcrumb items={[{ label: "IA Explorations", href: "/ia" }, { label: student.name }]} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{student.name}</h1>
          <p className="mt-1 text-slate-600">
            {cls ? `${cls.name} — ${dpCourseYear(cls)}` : "No class assigned"}
          </p>
        </div>
        {at >= 0 && classmates.length > 1 && (
          <nav aria-label="Other students" className="flex items-center gap-2 text-sm">
            {prev ? (
              <Link href={`/ia/${prev.id}`} className="rounded-md border border-slate-300 px-2.5 py-1 hover:bg-slate-100" title={prev.name}>
                ← {prev.name}
              </Link>
            ) : (
              <span className="rounded-md border border-slate-200 px-2.5 py-1 text-slate-300">← First</span>
            )}
            <span className="text-slate-500 tabular-nums">
              {at + 1} of {classmates.length}
            </span>
            {next ? (
              <Link href={`/ia/${next.id}`} className="rounded-md border border-slate-300 px-2.5 py-1 hover:bg-slate-100" title={next.name}>
                {next.name} →
              </Link>
            ) : (
              <span className="rounded-md border border-slate-200 px-2.5 py-1 text-slate-300">Last →</span>
            )}
          </nav>
        )}
      </div>

      <section>
        <h2 className="text-lg font-medium">Topic</h2>
        <div className="mt-2">
          <TopicForm key={exploration.topic ?? ""} studentId={studentId} topic={exploration.topic} />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium">Milestones</h2>
        <div className="mt-2">
          <MilestoneList studentId={studentId} doneMap={doneMap} deadlineMap={deadlineMap} />
        </div>
      </section>

      <UploadAndOutputsClient
        explorationId={exploration.id}
        studentName={student.name}
        pseudonym={student.pseudonym}
        documents={documents}
        outputs={outputs}
        rubric={rubric}
        draftView={draftView}
        itemMeanings={getIaItemMeanings()}
      />
    </div>
  );
}
