import "server-only";

import { listDescriptorChecks, upsertDescriptorCheck } from "@/lib/db/queries";
import { scrubOutput } from "@/lib/pipeline/guards";
import type { RubricDescriptorRow } from "@/lib/types";

/** One descriptor as the grader answered for it. */
export type DescriptorJudgment = { key: string; met: boolean; evidence: string };

/** The key the prompt hands out for a descriptor: opaque, and stable under reordering. */
export function descriptorKey(descriptor: RubricDescriptorRow): string {
  return `d${descriptor.id}`;
}

/**
 * Writes what the grader decided about each descriptor.
 *
 * Defensive on the way in, like the answer-key proposal: judgements are matched by
 * the opaque key the prompt handed out, keys it does not recognise are dropped (the
 * model never gets to invent a descriptor), and a descriptor the model simply did
 * not answer for is recorded as NOT JUDGED rather than as "not met".
 *
 * The teacher's own tick is carried forward. It is her judgement about the student's
 * work, not an endorsement of an AI answer — the same reason a re-grade preserves her
 * final marks. It is dropped only when the descriptor's wording has changed since she
 * ticked it, because then she was agreeing to something else.
 */
export function recordDescriptorChecks(
  submissionId: number,
  descriptors: RubricDescriptorRow[],
  judgments: DescriptorJudgment[] | undefined,
  forbiddenNames: string[]
): void {
  const byKey = new Map(
    (judgments ?? [])
      .filter((j) => j && typeof j.key === "string")
      .map((j) => [j.key.trim().toLowerCase(), j])
  );
  const priorByDescriptor = new Map(
    listDescriptorChecks(submissionId).map((c) => [c.descriptor_id, c])
  );

  for (const descriptor of descriptors) {
    const judged = byKey.get(descriptorKey(descriptor));
    const prior = priorByDescriptor.get(descriptor.id);
    const carriedFinal =
      prior && prior.text_at_check === descriptor.text ? prior.met_final : null;
    upsertDescriptorCheck({
      submission_id: submissionId,
      descriptor_id: descriptor.id,
      met_proposed: judged ? (judged.met ? 1 : 0) : null,
      met_final: carriedFinal,
      evidence: judged
        ? scrubOutput(String(judged.evidence ?? ""), forbiddenNames).text
        : "The grader returned no judgement for this descriptor.",
      text_at_check: descriptor.text,
    });
  }
}

