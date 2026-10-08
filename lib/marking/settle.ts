import "server-only";

import { getDb } from "@/lib/db";
import {
  listCriterionLevels,
  listGradings,
  upsertCriterionLevel,
  upsertGrading,
} from "@/lib/db/queries";
import type { DpGradingQuestion, GradingQuestion } from "@/lib/types";

/**
 * Turns every mark and level on one paper into the teacher's decision.
 *
 * Where the two markers disagree and nobody has picked, the app shows the
 * stricter one — and keeps calling it provisional, on the gradebook and on the
 * student's profile, however long ago the work was signed off. Accepting a
 * report, or settling a paper's discrepancies against an uploaded marks sheet,
 * IS the teacher agreeing with what is on screen, so it is recorded as such.
 *
 * Pins exactly what was displayed (`final ?? conservative`, the rule every
 * screen uses) and never changes a value. Anything already decided is left
 * alone. A mark edited afterwards still recomputes as usual.
 */
export function settleSubmission(submissionId: number): { marks: number; levels: number } {
  let marks = 0;
  let levels = 0;

  const run = getDb().transaction(() => {
    for (const grading of listGradings(submissionId)) {
      const content = grading.content as GradingQuestion | DpGradingQuestion;

      if ("subparts" in content && Array.isArray(content.subparts)) {
        // DP: each markscheme mark is its own decision.
        let changed = false;
        const subparts = content.subparts.map((sp) => ({
          ...sp,
          awards: sp.awards.map((a) => {
            if (a.finalAwarded !== undefined) return a;
            changed = true;
            marks += 1;
            return { ...a, finalAwarded: a.conservativeAwarded };
          }),
        }));
        if (changed) {
          upsertGrading({
            submission_id: submissionId,
            question_id: grading.question_id,
            content: { ...content, subparts } as unknown as GradingQuestion,
          });
        }
        continue;
      }

      const myp = content as GradingQuestion;
      if (myp.finalPoints != null) continue;
      upsertGrading({
        submission_id: submissionId,
        question_id: grading.question_id,
        content: { ...myp, finalPoints: myp.conservativePoints },
      });
      marks += 1;
    }

    for (const level of listCriterionLevels(submissionId)) {
      if (level.level_final != null) continue;
      upsertCriterionLevel({
        submission_id: submissionId,
        criterion: level.criterion,
        level_proposed: level.level_proposed,
        level_conservative: level.level_conservative,
        level_final: level.level_conservative,
        evidence: level.evidence,
      });
      levels += 1;
    }
  });
  run();

  return { marks, levels };
}
