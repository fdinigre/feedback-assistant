import "server-only";

import fs from "node:fs";
import path from "node:path";
import { runClaudeJson } from "@/lib/pipeline/run";
import { getStudent, listStudents } from "@/lib/db/queries";
import { CORE_SKILL_BY_ID, PRIOR_KNOWLEDGE_SKILL_IDS } from "@/lib/errors/core-skills";
import { getForbiddenNames, scrubOutput } from "@/lib/pipeline/guards";
import { computeCoreSkills } from "@/lib/students/patterns";

// Cached on the filesystem like the AI digest: derived, disposable, and only
// written when the teacher asks for it.
const TARGETS_DIR = path.join(process.cwd(), "data", "skill-targets");

export type SkillTarget = {
  /** A core-skill id from lib/errors/core-skills.ts. */
  skill: string;
  /** One "I can ..." sentence, written from this student's own mistakes. */
  target: string;
  /** How many questions the skill had cost marks on when the target was written. */
  questionsAtWriting: number;
};

export type SkillTargets = {
  studentId: number;
  targets: SkillTarget[];
  generatedAt: string; // ISO timestamp
  warnings: string[];
};

function cachePath(studentId: number): string {
  return path.join(TARGETS_DIR, `${studentId}.json`);
}

export function getCachedSkillTargets(studentId: number): SkillTargets | null {
  const file = cachePath(studentId);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as SkillTargets;
  } catch {
    return null;
  }
}

const MAX_WORDS = 25;

/**
 * Writes learning targets for the prior-knowledge skills that have cost this
 * student marks, from the marking phrases behind each. A target names what to do
 * right rather than what went wrong, and is specific to the slip the marking
 * describes (adding denominators, not "fractions").
 *
 * Incremental by default: a skill that already has a target and whose mistakes
 * have not changed is left alone, so a new report or a newly identified mistake
 * adds or updates only what it touches, and a student with nothing new costs no
 * AI call at all. `force` rewrites every target.
 *
 * Privacy as for the digest: the model sees marking evidence only, never a
 * name, and the output is scrubbed on the way out.
 *
 * Returns null when the student has no prior-knowledge mistakes yet.
 */
async function writeSkillTargets(
  studentId: number,
  { force = false }: { force?: boolean } = {}
): Promise<SkillTargets | null> {
  const student = getStudent(studentId);
  if (!student) throw new Error(`skill targets: student ${studentId} not found`);

  const skills = priorKnowledgeSkills(studentId);
  if (skills.length === 0) return getCachedSkillTargets(studentId);

  const cached = getCachedSkillTargets(studentId);
  const existing = new Map((cached?.targets ?? []).map((t) => [t.skill, t]));
  const toWrite = skills.filter((s) => {
    const have = existing.get(s.id);
    return force || !have || have.questionsAtWriting !== s.questions;
  });
  if (toWrite.length === 0) return cached;

  const forbiddenNames = getForbiddenNames(student.class_id);

  const skillBlock = toWrite
    .map((s) => {
      const def = CORE_SKILL_BY_ID.get(s.id);
      const quotes = s.quotes.length
        ? s.quotes.map((q) => `    - "${q}"`).join("\n")
        : "    - (no marking phrase recorded)";
      const previous = !force ? existing.get(s.id)?.target : undefined;
      return (
        `  id: ${s.id}\n  skill: ${s.name}\n  covers: ${def?.definition ?? ""}\n` +
        `  cost marks on ${s.questions} question(s) across: ${s.assessmentTitles.join(", ")}\n` +
        `  what the marking said:\n${quotes}` +
        (previous
          ? `\n  current target (keep its wording if it still fits the marking above; change it only if newer mistakes call for it): "${previous}"`
          : "")
      );
    })
    .join("\n\n");

  const prompt = `You are writing learning targets for a secondary mathematics student, from the mistakes already recorded in their marking.

CRITICAL — PRIVACY: You do not know this student's real name and must never invent or guess one. Do not address the student by name.

For each skill below, write ONE learning target:
- One sentence beginning "I can", under ${MAX_WORDS} words, in plain language a 14-year-old understands.
- It says what to do RIGHT, specific to the slip the marking describes (for example "I can find a common denominator before adding fractions", not "I can do fractions").
- If the marking phrases describe different slips, choose the one that recurs most or matters most; do not list them all.
- Ground it only in the marking given. Do not invent mistakes that are not there. If the marking phrases are missing or too vague to be specific, write a clear general target for the skill.

SKILLS AND THE MARKING BEHIND THEM:
${skillBlock}

Return ONLY JSON in this shape, one entry per skill id above, no other text:
{"targets":[{"id":"<skill id>","target":"I can ..."}]}`;

  const parsed = await runClaudeJson<{ targets: { id: string; target: string }[] }>({
    purpose: "student-skill-targets",
    prompt,
    forbiddenNames,
  });

  const byId = new Map(toWrite.map((s) => [s.id, s]));
  const warnings: string[] = [];
  const written = new Map<string, SkillTarget>();
  for (const row of parsed.targets ?? []) {
    const skill = byId.get(row.id);
    if (!skill || typeof row.target !== "string" || !row.target.trim()) continue;
    const scrubbed = scrubOutput(row.target, forbiddenNames);
    warnings.push(...scrubbed.warnings);
    written.set(skill.id, {
      skill: skill.id,
      target: scrubbed.text.trim(),
      questionsAtWriting: skill.questions,
    });
  }
  if (written.size === 0) throw new Error("skill targets: the AI returned no usable targets");

  // Same order as the cards: a target for a skill that was not rewritten stays as it was.
  const targets = skills
    .map((s) => written.get(s.id) ?? existing.get(s.id))
    .filter((t): t is SkillTarget => !!t);

  const result: SkillTargets = {
    studentId,
    targets,
    generatedAt: new Date().toISOString(),
    warnings: [...(cached?.warnings ?? []), ...warnings],
  };
  fs.mkdirSync(TARGETS_DIR, { recursive: true });
  fs.writeFileSync(cachePath(studentId), JSON.stringify(result, null, 2), "utf-8");
  return result;
}

function priorKnowledgeSkills(studentId: number) {
  return computeCoreSkills(studentId).filter((s) => PRIOR_KNOWLEDGE_SKILL_IDS.has(s.id));
}

// One run per student at a time. A second request for the same student waits for
// the first and then runs on what has changed since, so two papers finishing
// together cannot overwrite each other's targets.
const inFlight = new Map<number, Promise<unknown>>();

export function queueSkillTargets(
  studentId: number,
  opts: { force?: boolean } = {}
): Promise<SkillTargets | null> {
  const previous = inFlight.get(studentId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => writeSkillTargets(studentId, opts));
  const tracked = next.catch(() => undefined).finally(() => {
    if (inFlight.get(studentId) === tracked) inFlight.delete(studentId);
  });
  inFlight.set(studentId, tracked);
  return next;
}

/**
 * Called after a paper's mistakes are identified or its report is written.
 * Runs behind the request so the marking pipeline never waits on it, and a
 * failure here (the AI is signed out, quota used up) leaves the marking alone:
 * the page's button, or the next paper, picks it up.
 */
export function refreshSkillTargetsInBackground(studentId: number | null | undefined): void {
  if (typeof studentId !== "number") return;
  queueSkillTargets(studentId).catch((err) => {
    console.error(`skill targets for student ${studentId}:`, (err as Error).message);
  });
}

/** Students whose targets are missing or out of date, for the "all students" button. */
export function listStudentsNeedingSkillTargets(): {
  needing: { id: number; name: string }[];
  withMistakes: number;
} {
  const needing: { id: number; name: string }[] = [];
  let withMistakes = 0;
  for (const student of listStudents()) {
    const skills = priorKnowledgeSkills(student.id);
    if (skills.length === 0) continue;
    withMistakes += 1;
    const existing = new Map(
      (getCachedSkillTargets(student.id)?.targets ?? []).map((t) => [t.skill, t])
    );
    if (skills.some((s) => existing.get(s.id)?.questionsAtWriting !== s.questions)) {
      needing.push({ id: student.id, name: student.name });
    }
  }
  return { needing, withMistakes };
}
