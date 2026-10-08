// Benchmark runner: transcribe + grade every submission of an assessment, so its
// tool marks can be compared to the teacher's answer key. Illegible flags are
// resolved NEUTRALLY (grade what was read) so grading completes unattended; students
// that had flags are logged. Run: npx tsx --conditions=react-server scripts/benchmark-run.mts <assessmentId>
import {
  listSubmissions,
  listTranscripts,
  upsertTranscript,
  getStudent,
} from "@/lib/db/queries";
import { transcribeSubmission } from "@/lib/pipeline/transcribe";
import { gradeSubmission } from "@/lib/pipeline/grade";

const assessmentId = Number(process.argv[2] ?? "5");
const CONCURRENCY = 3;

const subs = listSubmissions(assessmentId).filter(
  (s) => s.student_id != null && s.status !== "absent" && s.pdf_path != null
);
console.log(`Benchmark: ${subs.length} submissions for assessment ${assessmentId}`);

function resolveFlagsNeutrally(submissionId: number): number {
  let resolved = 0;
  for (const t of listTranscripts(submissionId)) {
    const c = t.content;
    let changed = false;
    for (const f of c.illegible) {
      if (f.resolvedText === undefined) {
        const step = c.steps[f.stepIndex];
        f.resolvedText = step ? step.text.replace(/\[\?\]/g, "").trim() : "";
        resolved++;
        changed = true;
      }
    }
    if (changed) upsertTranscript({ submission_id: submissionId, question_id: t.question_id, content: c });
  }
  return resolved;
}

async function runOne(sub: (typeof subs)[number]) {
  const name = getStudent(sub.student_id as number)?.name ?? `sub${sub.id}`;
  try {
    if (sub.status === "assigned" || sub.status === "uploaded") {
      await transcribeSubmission(sub.id);
    }
    const flags = resolveFlagsNeutrally(sub.id);
    await gradeSubmission(sub.id);
    console.log(`OK   ${name} (sub ${sub.id})${flags ? ` — ${flags} illegible flag(s) auto-resolved` : ""}`);
  } catch (err) {
    console.log(`FAIL ${name} (sub ${sub.id}): ${(err as Error).message}`);
  }
}

let cursor = 0;
async function worker() {
  while (true) {
    const sub = subs[cursor++];
    if (!sub) return;
    await runOne(sub);
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, subs.length) }, () => worker()));
console.log("Benchmark run complete.");
