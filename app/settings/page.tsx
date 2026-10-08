import {
  getIaChecklist,
  listAiRequests,
  listAllMarkingInstructions,
  listAssessments,
  listStyleExamples,
} from "@/lib/db/queries";
import { StyleExamplesSection } from "./_components/StyleExamplesSection";
import { MarkingInstructionsSection } from "./_components/MarkingInstructionsSection";
import { IaChecklistSection } from "./_components/IaChecklistSection";
import { AiRequestLog } from "./_components/AiRequestLog";
import { aiProvider } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const aiName = aiProvider() === "gemini" ? "Gemini" : "Claude";
  const commentExamples = listStyleExamples("comment");
  const reportExamples = listStyleExamples("report");
  const aiRequests = listAiRequests().slice(0, 50);
  const markingInstructions = listAllMarkingInstructions();
  const assessmentTitles = Object.fromEntries(listAssessments().map((a) => [a.id, a.title]));
  const iaChecklist = getIaChecklist();

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-slate-600">
          Configure the assistant&apos;s feedback voice and review exactly what it sends to the AI.
        </p>
      </div>

      <StyleExamplesSection commentExamples={commentExamples} reportExamples={reportExamples} />

      <MarkingInstructionsSection rows={markingInstructions} assessmentTitles={assessmentTitles} />

      <IaChecklistSection checklist={iaChecklist} />

      <section>
        <h2 className="text-lg font-medium">AI request log</h2>
        <p className="mt-1 text-sm text-slate-600">
          Your data is stored only on this computer. AI steps do send text and scan images to
          {" "}{aiName} to be read — but names are replaced with pseudonyms and page 1&rsquo;s name area is
          masked first, and every outbound request is logged here before sending so you can open any
          prompt file and check. Note: only the pages you mask are hidden in the scan images (page 1
          always, plus any page you add), and the guard checks text, not the pixels of unmasked
          pages. Showing the last {aiRequests.length} request
          {aiRequests.length === 1 ? "" : "s"}.
        </p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 px-4">
          {aiRequests.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">No AI requests logged yet.</p>
          ) : (
            <AiRequestLog requests={aiRequests} />
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium">About this data</h2>
        <div className="mt-3 space-y-2 rounded-lg border border-slate-200 p-4 text-sm text-slate-700">
          <p>
            Everything this app knows lives locally, in this project&apos;s <code>data/</code>{" "}
            directory: the SQLite database (<code>data/app.db</code>), uploaded submission PDFs,
            extracted pages, and every logged AI prompt/response pair. Nothing is stored in the
            cloud.
          </p>
          <p>
            Student identity is protected before anything reaches the AI: page-1 name masking
            blacks out the handwritten name on the scan, and every student is referred to by a
            generated pseudonym (e.g. <code>S-0421</code>) instead of their real name in prompts.
            Per school policy, both first and last names are removed — a hard guard refuses to send
            (and logs nothing) if any roster name, first name included, is still present in the text.
          </p>
        </div>
      </section>
    </div>
  );
}
