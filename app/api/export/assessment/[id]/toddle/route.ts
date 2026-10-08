import { getAssessment } from "@/lib/db/queries";
import { buildToddleDocument } from "@/lib/export/toddle-doc";

// Every student's Toddle comment and their criterion levels, in one document.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const assessmentId = Number(id);
  const assessment = getAssessment(assessmentId);
  if (!assessment) {
    return new Response("Assessment not found", { status: 404 });
  }

  const doc = buildToddleDocument(assessment);
  if (doc.studentCount === 0) {
    return new Response(
      "No Toddle comments yet — generate reports first.",
      { status: 404 }
    );
  }

  const safeTitle = assessment.title.replace(/[^a-z0-9]+/gi, "-");
  return new Response(doc.html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeTitle}-toddle-comments.html"`,
      "Cache-Control": "no-store",
    },
  });
}
