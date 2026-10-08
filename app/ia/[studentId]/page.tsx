import { notFound } from "next/navigation";
import {
  findOrCreateIaExploration,
  getClass,
  getStudent,
  listIaDeadlines,
  listIaDocuments,
  listIaOutputs,
  listIaProgress,
} from "@/lib/db/queries";
import { Breadcrumb } from "@/app/_components/Breadcrumb";
import { dpCourseYear } from "@/lib/assessment/course";
import { TopicForm } from "./_components/TopicForm";
import { MilestoneList } from "./_components/MilestoneList";
import { UploadAndOutputsClient } from "./_components/UploadAndOutputsClient";

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

  const doneMap = Object.fromEntries(progress.map((p) => [p.milestone, p.completed_at]));
  const deadlineMap = Object.fromEntries(deadlines.map((d) => [d.milestone, d.due_date]));

  return (
    <div className="space-y-8 pb-16">
      <Breadcrumb items={[{ label: "IA Explorations", href: "/ia" }, { label: student.name }]} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{student.name}</h1>
        <p className="mt-1 text-slate-600">
          {cls ? `${cls.name} — ${dpCourseYear(cls)}` : "No class assigned"}
        </p>
      </div>

      <section>
        <h2 className="text-lg font-medium">Topic</h2>
        <div className="mt-2">
          <TopicForm studentId={studentId} topic={exploration.topic} />
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
      />
    </div>
  );
}
