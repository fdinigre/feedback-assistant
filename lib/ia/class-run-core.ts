// The queue behind "Generate draft feedback for the class" and "Run math check for
// N students": it lives in the app's server, not the browser tab, so leaving or
// reloading the page doesn't stop it. Pure apart from the job function it is
// handed, so the checks can drive it with a stand-in.

export type ClassJob = "feedback" | "math";
export type ItemState = "waiting" | "running" | "done" | "error" | "skipped";

export type RunItem = {
  studentId: number;
  explorationId: number;
  state: ItemState;
  note?: string; // an error, or "done, but the math check failed: …"
};

export type ClassRun = {
  id: string;
  classId: number;
  job: ClassJob;
  items: RunItem[];
  startedAt: string;
  finishedAt?: string;
  stopRequested: boolean;
};

/** What one student's job reports: nothing for plain success, a note for a partial one. Throws on failure. */
export type JobFn = (explorationId: number) => Promise<{ note?: string } | void>;

export function createRun(
  classId: number,
  job: ClassJob,
  items: { studentId: number; explorationId: number }[]
): ClassRun {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    classId,
    job,
    items: items.map((i) => ({ ...i, state: "waiting" })),
    startedAt: new Date().toISOString(),
    stopRequested: false,
  };
}

export function isRunning(run: ClassRun | null | undefined): boolean {
  return !!run && !run.finishedAt;
}

/**
 * Works through the run `atOnce` students at a time. A failure is recorded and the
 * run carries on. Stop lets the ones already running finish and starts no more;
 * the rest are marked skipped.
 */
export async function processRun(run: ClassRun, fn: JobFn, atOnce: number): Promise<void> {
  let next = 0;
  async function worker() {
    while (!run.stopRequested && next < run.items.length) {
      const item = run.items[next++];
      item.state = "running";
      try {
        const r = await fn(item.explorationId);
        item.state = "done";
        if (r && r.note) item.note = r.note;
      } catch (err) {
        item.state = "error";
        item.note = (err as Error).message || "Failed.";
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(atOnce, run.items.length)) }, worker));
  for (const item of run.items) if (item.state === "waiting") item.state = "skipped";
  run.finishedAt = new Date().toISOString();
}
