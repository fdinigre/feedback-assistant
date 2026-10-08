/**
 * Tags every graded paper already on file against the error mechanisms in
 * lib/errors/taxonomy.ts and the core skills in lib/errors/core-skills.ts,
 * reading the marking evidence rather than re-marking.
 *
 *   npx tsx --conditions=react-server scripts/error-tags-backfill.ts            # papers with no tags yet
 *   npx tsx --conditions=react-server scripts/error-tags-backfill.ts --all      # re-tag everything
 *   npx tsx --conditions=react-server scripts/error-tags-backfill.ts --skills   # core skills only, on papers
 *                                                                               # tagged before they existed
 *   ... --skills --all   # redo the core skills on every paper, leaving mistake kinds alone
 *   npx tsx --conditions=react-server scripts/error-tags-backfill.ts --limit 5  # try a few first
 *   ... --shard 2/5   # this run takes every 5th paper starting at the 3rd, so five
 *                     # runs started together split the list without overlapping
 */
import {
  listAssessments,
  listSubmissions,
  hasErrorTags,
  hasSkillTags,
  getStudent,
} from "@/lib/db/queries";
import { classifyErrors } from "@/lib/errors/classify";

const all = process.argv.includes("--all");
const skillsOnly = process.argv.includes("--skills");
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;
const shardArg = process.argv.indexOf("--shard");
const [shard, shards] =
  shardArg >= 0 ? process.argv[shardArg + 1].split("/").map(Number) : [0, 1];

async function main() {
  const todo: { id: number; who: string; assessment: string }[] = [];
  for (const assessment of listAssessments()) {
    for (const submission of listSubmissions(assessment.id)) {
      if (submission.status !== "graded" && submission.status !== "reviewed") continue;
      if (!all && (skillsOnly ? hasSkillTags(submission.id) : hasErrorTags(submission.id))) continue;
      const student = submission.student_id ? getStudent(submission.student_id) : null;
      todo.push({
        id: submission.id,
        who: student?.name ?? `submission ${submission.id}`,
        assessment: assessment.title,
      });
    }
  }

  const slice = todo.filter((_, i) => i % shards === shard).slice(0, limit);
  console.log(`${todo.length} paper(s) to tag${slice.length < todo.length ? `, doing ${slice.length}` : ""}\n`);

  let tags = 0;
  let skills = 0;
  for (const [i, item] of slice.entries()) {
    try {
      const result = await classifyErrors(item.id, { skillsOnly });
      tags += result.tagsWritten;
      skills += result.skillTagsWritten;
      console.log(
        `${String(i + 1).padStart(3)}/${slice.length}  ${item.who} — ${item.assessment}: ` +
          `${result.questionsRead} question(s) read, ${result.tagsWritten} tag(s), ` +
          `${result.skillTagsWritten} skill tag(s)`
      );
    } catch (err) {
      // One paper failing is not a reason to lose the rest of the run.
      console.log(`${String(i + 1).padStart(3)}/${slice.length}  ${item.who} — FAILED: ${(err as Error).message.slice(0, 160)}`);
    }
  }
  console.log(`\n${tags} tag(s) and ${skills} skill tag(s) written across ${slice.length} paper(s)`);
}

main();
