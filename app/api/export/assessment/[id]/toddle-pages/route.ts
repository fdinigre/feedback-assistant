import { getAssessment } from "@/lib/db/queries";
import { buildToddlePagesDocx } from "@/lib/export/toddle-docx";

// Every student's Toddle comment as a Word document, one student per page, no grades.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const assessment = getAssessment(Number(id));
  if (!assessment) {
    return new Response("Assessment not found", { status: 404 });
  }

  const { buffer, studentCount } = buildToddlePagesDocx(assessment);
  if (studentCount === 0) {
    return new Response("No Toddle comments yet — generate reports first.", { status: 404 });
  }

  const safeTitle = assessment.title.replace(/[^a-z0-9]+/gi, "-");
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeTitle}-toddle-comments-by-page.docx"`,
      "Cache-Control": "no-store",
    },
  });
}
