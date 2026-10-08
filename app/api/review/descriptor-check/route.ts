import {
  getDescriptorCheck,
  getRubricDescriptor,
  getSubmission,
  upsertDescriptorCheck,
} from "@/lib/db/queries";
import type { DescriptorCheckRow } from "@/lib/types";

type Body = {
  submissionId: number;
  /** met: true/false is the teacher's tick; null hands the descriptor back to the grader's. */
  checks: { descriptorId: number; met: boolean | null }[];
};

/**
 * Records the teacher's own tick against one or more rubric descriptors.
 *
 * Only met_final moves: what the grader proposed and the evidence it cited stay
 * on the row, so the panel can keep showing where the two disagree. The level is
 * deliberately NOT recalculated — ticks inform the best fit, they do not decide it.
 * Takes an array so ticking a whole band is one request.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Partial<Body> | null;
  if (!body || typeof body.submissionId !== "number" || !Array.isArray(body.checks)) {
    return Response.json({ error: "submissionId and checks are required" }, { status: 400 });
  }

  const submission = getSubmission(body.submissionId);
  if (!submission) return Response.json({ error: "Submission not found" }, { status: 404 });

  const saved: DescriptorCheckRow[] = [];
  for (const check of body.checks) {
    if (typeof check?.descriptorId !== "number") {
      return Response.json({ error: "Each check needs a descriptorId" }, { status: 400 });
    }
    const descriptor = getRubricDescriptor(check.descriptorId);
    if (!descriptor) {
      return Response.json({ error: `Descriptor ${check.descriptorId} not found` }, { status: 404 });
    }
    // A descriptor from another assessment can never apply to this submission.
    if (descriptor.assessment_id !== submission.assessment_id) {
      return Response.json(
        { error: `Descriptor ${check.descriptorId} belongs to another assessment` },
        { status: 400 }
      );
    }

    const current = getDescriptorCheck(body.submissionId, check.descriptorId);
    saved.push(
      upsertDescriptorCheck({
        submission_id: body.submissionId,
        descriptor_id: check.descriptorId,
        met_proposed: current?.met_proposed ?? null,
        met_final: check.met === null || check.met === undefined ? null : check.met ? 1 : 0,
        evidence: current?.evidence ?? "",
        // A descriptor the grader never judged has no recorded wording yet; the
        // teacher is ticking against what it says now.
        text_at_check: current?.text_at_check ?? descriptor.text,
      })
    );
  }

  return Response.json({ checks: saved });
}
