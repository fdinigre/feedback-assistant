import "server-only";

import { generateDraftFeedback, generateMathCheckOnly } from "@/lib/ia/feedback";
import { createRun, isRunning, processRun, type ClassJob, type ClassRun, type JobFn } from "@/lib/ia/class-run-core";
import type { IaDraftFeedback } from "@/lib/types";

/** How many students are worked on at once (each math check is itself split into chunks). */
const AT_ONCE = 2;

// One run at a time for the whole app, kept on globalThis so it survives the dev
// server reloading this module. It lives as long as the app is running: quitting
// the app stops it, and the students it had not reached are simply not done.
const store = globalThis as unknown as { __iaClassRun?: ClassRun | null };

const JOBS: Record<ClassJob, JobFn> = {
  feedback: async (explorationId) => {
    const out = await generateDraftFeedback(explorationId);
    const err = (out.content as IaDraftFeedback).mathCheckError;
    return err ? { note: `Feedback done, but the math check failed: ${err}` } : undefined;
  },
  math: async (explorationId) => {
    await generateMathCheckOnly(explorationId);
  },
};

export function currentRun(): ClassRun | null {
  return store.__iaClassRun ?? null;
}

export function startClassRun(
  classId: number,
  job: ClassJob,
  items: { studentId: number; explorationId: number }[]
): { run?: ClassRun; error?: string } {
  const existing = currentRun();
  if (isRunning(existing)) {
    return { error: "Another class run is still going — wait for it to finish, or stop it, first." };
  }
  if (items.length === 0) return { error: "No students to run." };
  const run = createRun(classId, job, items);
  store.__iaClassRun = run;
  // Not awaited: the request returns at once and the run carries on in the server.
  void processRun(run, JOBS[job], AT_ONCE);
  return { run };
}

export function stopClassRun(): ClassRun | null {
  const run = currentRun();
  if (run && isRunning(run)) run.stopRequested = true;
  return run;
}
