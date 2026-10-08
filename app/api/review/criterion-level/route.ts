import { getCriterionLevel, upsertCriterionLevel } from "@/lib/db/queries";

type Body = {
  submissionId: number;
  criterion: string;
  levelFinal: number | null;
};

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<Body>;

  if (typeof body.submissionId !== "number" || !body.criterion) {
    return Response.json(
      { error: "submissionId and criterion are required" },
      { status: 400 }
    );
  }

  const current = getCriterionLevel(body.submissionId, body.criterion);
  if (!current) {
    return Response.json({ error: "Criterion level not found" }, { status: 404 });
  }

  const row = upsertCriterionLevel({
    submission_id: body.submissionId,
    criterion: body.criterion,
    level_proposed: current.level_proposed,
    level_conservative: current.level_conservative,
    level_final: body.levelFinal ?? null,
    evidence: current.evidence,
  });

  return Response.json({ criterionLevel: row });
}
