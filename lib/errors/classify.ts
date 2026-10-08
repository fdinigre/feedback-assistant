import "server-only";

import {
  getAssessment,
  getStudent,
  getSubmission,
  listGradings,
  listQuestions,
  markErrorTagsScanned,
  markSkillTagsScanned,
  replaceErrorTags,
  replaceSkillTags,
} from "@/lib/db/queries";
import { getForbiddenNames, scrubOutput } from "@/lib/pipeline/guards";
import { runClaudeJson } from "@/lib/pipeline/run";
import { isMechanismId, mechanismPromptBlock } from "@/lib/errors/taxonomy";
import { coreSkillPromptBlock, isCoreSkillId } from "@/lib/errors/core-skills";

/**
 * Labels the questions that lost marks on one paper against the closed list of
 * error mechanisms, and against the core skills they went wrong in, reading the
 * marking evidence already on file.
 *
 * It reads rather than re-marks on purpose: there are 1,464 gradings here and
 * none of them needs doing again. The model's only job is to put an existing
 * sentence into one of thirteen boxes, and a label that is not one of the
 * thirteen is dropped rather than nudged into the nearest one — the counts built
 * on top of this are meant to be arithmetic she can check, not a judgement.
 */

type Candidate = { questionId: number; number: string; evidence: string };

/** One passage per question that lost marks, whichever grading shape it is in. */
function candidates(submissionId: number): Candidate[] {
  const submission = getSubmission(submissionId);
  if (!submission) return [];
  const questionById = new Map(listQuestions(submission.assessment_id).map((q) => [q.id, q]));
  const out: Candidate[] = [];

  for (const grading of listGradings(submissionId)) {
    const question = questionById.get(grading.question_id);
    if (!question) continue;
    const c = grading.content as unknown as {
      finalPoints?: number | null;
      conservativePoints?: number;
      evidence?: string;
      subparts?: {
        awards?: { awarded?: boolean; conservativeAwarded?: boolean; finalAwarded?: boolean; evidence?: string }[];
      }[];
    };

    // A Diploma grading keeps one line of evidence per mark inside its
    // sub-parts; the lost ones are joined into a single passage per question.
    if (Array.isArray(c.subparts)) {
      const lost = c.subparts
        .flatMap((p) => p.awards ?? [])
        // The decided mark, as everywhere else: lost unless awarded after review.
        .filter((a) => (a.finalAwarded ?? a.conservativeAwarded ?? a.awarded) === false)
        .map((a) => (a.evidence ?? "").trim())
        .filter((e) => e.length > 0);
      if (lost.length === 0) continue;
      out.push({ questionId: question.id, number: question.number, evidence: lost.join(" ") });
      continue;
    }

    const awarded = c.finalPoints ?? c.conservativePoints ?? 0;
    if (awarded >= question.max_points) continue;
    const evidence = (c.evidence ?? "").trim();
    if (evidence.length < 40) continue;
    out.push({ questionId: question.id, number: question.number, evidence });
  }
  return out;
}

export type ClassifyResult = {
  submissionId: number;
  questionsRead: number;
  tagsWritten: number;
  skillTagsWritten: number;
};

/**
 * `skillsOnly` writes the core-skill tags and leaves the mechanism tags as they
 * are. For papers tagged before core skills existed: the mechanism counts on
 * them have already been looked at, and a fresh run would shuffle them for no
 * reason.
 */
export async function classifyErrors(
  submissionId: number,
  { skillsOnly = false }: { skillsOnly?: boolean } = {}
): Promise<ClassifyResult> {
  const items = candidates(submissionId);
  if (items.length === 0) {
    if (!skillsOnly) {
      replaceErrorTags(submissionId, []);
      markErrorTagsScanned(submissionId);
    }
    replaceSkillTags(submissionId, []);
    markSkillTagsScanned(submissionId);
    return { submissionId, questionsRead: 0, tagsWritten: 0, skillTagsWritten: 0 };
  }

  const submission = getSubmission(submissionId);
  const assessment = submission ? getAssessment(submission.assessment_id) : null;
  const student = submission?.student_id ? getStudent(submission.student_id) : null;
  const forbiddenNames = getForbiddenNames(student?.id ?? undefined);

  const block = items
    .map(
      (i) =>
        `ref=${i.questionId}  (this paper's question ${i.number})\n${i.evidence
          .replace(/\s+/g, " ")
          .slice(0, 900)}`
    )
    .join("\n\n");

  const prompt = `Below is the marking evidence for the questions that lost marks on one
${assessment?.title ?? "assessment"} paper. Each passage explains why marks were not awarded.

Label each one twice.

1. "tags": the kinds of mistake it describes — HOW it went wrong — using ONLY these ids:

${mechanismPromptBlock()}

2. "skills": the core skill it went wrong IN — WHAT broke down — using ONLY these ids:

${coreSkillPromptBlock()}

A slip can carry both (a lost minus sign is lost-minus-sign AND integers-signs). Many carry only
one: a missing reason is a mechanism with no skill, and a fraction mis-simplified may fit no
mechanism.

A core skill is tagged ONLY where the passage shows that skill being carried out WRONGLY. Two
things that are never a core skill, however close one looks:
- Something not done at all: a value never found, an equation never formed, a step never
  attempted, a final answer never stated. That is not solving-equations or substitution done
  badly; leave "skills" empty (the mechanism list covers it).
- Knowledge of the unit's topic: probability rules, quartiles and statistics, Voronoi diagrams,
  sequences formulas, which formula or method the question needs. Leave "skills" empty unless a
  core skill also went wrong inside it (a sign error in a gradient is still integers-signs).

Rules:
- Use the id exactly. Never invent one. If nothing in the list fits, return no tags for that
  question — an empty list is a correct answer and much better than a near miss.
- A question may carry more than one id, but only where the passage really describes more than
  one mistake. Two or three is plenty; do not label everything with everything.
- Do NOT tag a question for being blank, unattempted, illegible or crossed out. Those are counted
  elsewhere. If the passage is only about those, return no tags for it.
- For each id you use, in either list, quote the shortest phrase FROM THE PASSAGE that justifies it,
  verbatim.
- "questionId" must be the number after ref=, NOT the question number printed beside it and NOT a
  position in this list. They are different numbers and only ref= identifies the passage.

EVIDENCE:
${block}

Return ONLY strict JSON:
{ "questions": [ { "questionId": <number>,
    "tags": [ { "mechanism": "<id>", "quote": "<verbatim phrase>" } ],
    "skills": [ { "skill": "<id>", "quote": "<verbatim phrase>" } ] } ] }
No prose, no code fences.`;

  const parsed = await runClaudeJson<{
    questions?: {
      questionId?: number;
      tags?: { mechanism?: string; quote?: string }[];
      skills?: { skill?: string; quote?: string }[];
    }[];
  }>({
    purpose: "error-tags",
    prompt,
    forbiddenNames,
    // Classifying into a closed list is not hard work, and this runs once per
    // paper across a whole year of marking.
    model: "haiku",
  });

  const known = new Set(items.map((i) => i.questionId));
  // It still sometimes answers with the question number rather than the ref, so
  // accept that where it is unambiguous rather than silently dropping the paper
  // — which is exactly what happened to five papers on the first full run.
  const byNumber = new Map<string, number>();
  for (const i of items) {
    const key = String(i.number).trim();
    byNumber.set(key, byNumber.has(key) ? -1 : i.questionId);
  }
  const tags: { question_id: number; mechanism: string; quote: string }[] = [];
  const skills: { question_id: number; skill: string; quote: string }[] = [];
  for (const q of parsed.questions ?? []) {
    if (typeof q.questionId !== "number") continue;
    const resolved = known.has(q.questionId)
      ? q.questionId
      : (byNumber.get(String(q.questionId)) ?? -1);
    if (resolved < 0) continue;
    for (const tag of q.tags ?? []) {
      if (!isMechanismId(tag.mechanism)) continue;
      tags.push({
        question_id: resolved,
        mechanism: tag.mechanism,
        quote: scrubOutput(String(tag.quote ?? ""), forbiddenNames).text.slice(0, 300),
      });
    }
    for (const tag of q.skills ?? []) {
      if (!isCoreSkillId(tag.skill)) continue;
      skills.push({
        question_id: resolved,
        skill: tag.skill,
        quote: scrubOutput(String(tag.quote ?? ""), forbiddenNames).text.slice(0, 300),
      });
    }
  }

  if (!skillsOnly) {
    replaceErrorTags(submissionId, tags);
    markErrorTagsScanned(submissionId);
  }
  replaceSkillTags(submissionId, skills);
  markSkillTagsScanned(submissionId);
  return {
    submissionId,
    questionsRead: items.length,
    tagsWritten: skillsOnly ? 0 : tags.length,
    skillTagsWritten: skills.length,
  };
}
