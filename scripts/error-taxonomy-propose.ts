/**
 * Reads the marking evidence already on file and proposes the error mechanisms
 * that recur in it, so the closed list the app tags against comes from this
 * teacher's own marking rather than from a guess about what maths students get
 * wrong.
 *
 * Nothing is written. It prints a proposal to read, amend and then hard-code.
 *
 * Run: npx tsx --conditions=react-server scripts/error-taxonomy-propose.ts
 */
import {
  listClasses,
  listGradings,
  listQuestions,
  listStudents,
  getAssessment,
  listSubmissions,
  listAssessments,
} from "@/lib/db/queries";
import { runClaudeJson } from "@/lib/pipeline/run";
import fs from "node:fs";
import path from "node:path";

/** Cached, because this is an expensive call whose answer only changes when
 *  there is a lot more marking on file. Delete the file to run it again. */
const CACHE = path.join(process.cwd(), "data", "error-taxonomy-proposal.json");

/** Enough evidence to see what recurs, few enough to fit one prompt. */
const PER_ASSESSMENT = 40;

type Sample = { assessment: string; evidence: string };

function collect(): Sample[] {
  const out: Sample[] = [];
  for (const assessment of listAssessments()) {
    const questionById = new Map(listQuestions(assessment.id).map((q) => [q.id, q]));
    const forThis: Sample[] = [];
    for (const submission of listSubmissions(assessment.id)) {
      for (const grading of listGradings(submission.id)) {
        const question = questionById.get(grading.question_id);
        if (!question) continue;
        const c = grading.content as unknown as {
          finalPoints?: number | null;
          conservativePoints?: number;
          evidence?: string;
          // A Diploma grading has no top-level evidence: it keeps one line per
          // mark inside the sub-parts, which is why the DP class produced
          // nothing at all the first time this ran.
          subparts?: { awards?: { awarded?: boolean; finalAwarded?: boolean; evidence?: string }[] }[];
        };

        if (Array.isArray(c.subparts)) {
          for (const part of c.subparts) {
            for (const award of part.awards ?? []) {
              if ((award.finalAwarded ?? award.awarded) !== false) continue;
              const evidence = (award.evidence ?? "").trim();
              if (evidence.length < 50) continue;
              forThis.push({ assessment: assessment.title, evidence });
            }
          }
          continue;
        }

        const awarded = c.finalPoints ?? c.conservativePoints ?? 0;
        // Only questions that lost something: full marks have no error to name.
        if (awarded >= question.max_points) continue;
        const evidence = (c.evidence ?? "").trim();
        if (evidence.length < 50) continue;
        forThis.push({ assessment: assessment.title, evidence });
      }
    }
    // Spread across the assessment rather than taking the first N students.
    const step = Math.max(1, Math.floor(forThis.length / PER_ASSESSMENT));
    for (let i = 0; i < forThis.length && out.length < 400; i += step) out.push(forThis[i]);
  }
  return out;
}

async function main() {
  const samples = collect();
  console.log(`Classes: ${listClasses().length}, students: ${listClasses().reduce((n, c) => n + listStudents(c.id).length, 0)}`);
  console.log(`Evidence passages sampled: ${samples.length}\n`);
  if (samples.length === 0) return;

  const block = samples
    .map((s, i) => `[${i + 1}] (${s.assessment})\n${s.evidence.replace(/\s+/g, " ").slice(0, 600)}`)
    .join("\n\n");

  const prompt = `You are reading real marking evidence from one secondary mathematics teacher's
assessments. Each passage explains why a question lost marks.

Your job is to propose the recurring ERROR MECHANISMS in this body of marking — the KIND of mistake
the student made, not the topic it happened in. "Solving linear equations" is a topic and is already
tracked elsewhere; "expanded a squared bracket as if the terms were separate" is a mechanism.

Rules:
- Do NOT propose "the question was blank / not attempted" or "the work was illegible or crossed
  out" as mechanisms. Both are counted separately by other means, and both are so common that
  including them would crowd out everything worth acting on. Skip passages that are only about
  those, and say so in leftOver.
- Propose between 6 and 14 mechanisms. Each must appear in several different passages; a mechanism
  that fits one passage is not a pattern.
- Name them the way a maths teacher would say them out loud to a student, not in education jargon.
- They must be distinguishable: if two would often both apply to the same passage, merge them.
- Cover the body of evidence. Say what is left over rather than stretching a category to fit it.
- Count honestly: approxCount is how many of the numbered passages you judge it fits.

EVIDENCE:
${block}

Return ONLY strict JSON:
{
  "mechanisms": [
    {
      "name": "<short name, as a teacher would say it>",
      "definition": "<one sentence: what counts as this>",
      "notThis": "<one sentence: the nearest thing that is NOT this, to keep it distinguishable>",
      "approxCount": <integer>,
      "examplePassages": [<passage numbers>]
    }
  ],
  "leftOver": "<what the mechanisms above do not cover, honestly>"
}
No prose, no code fences.`;

  type Proposal = {
    mechanisms: {
      name: string;
      definition: string;
      notThis: string;
      approxCount: number;
      examplePassages: number[];
    }[];
    leftOver: string;
  };

  let result: Proposal;
  if (fs.existsSync(CACHE) && !process.argv.includes("--fresh")) {
    result = JSON.parse(fs.readFileSync(CACHE, "utf-8")) as Proposal;
    console.log(`(from ${CACHE} — pass --fresh to ask again)\n`);
  } else {
    result = await runClaudeJson<Proposal>({ purpose: "error-taxonomy", prompt, forbiddenNames: [] });
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, JSON.stringify(result, null, 2));
  }

  for (const m of result.mechanisms.sort((a, b) => b.approxCount - a.approxCount)) {
    console.log(`${String(m.approxCount).padStart(4)}  ${m.name}`);
    console.log(`      ${m.definition}`);
    console.log(`      not this: ${m.notThis}`);
    const example = samples[(m.examplePassages[0] ?? 1) - 1];
    if (example) console.log(`      e.g. ${example.evidence.replace(/\s+/g, " ").slice(0, 150)}…`);
    console.log();
  }
  console.log("LEFT OVER:", result.leftOver);
}

main();
