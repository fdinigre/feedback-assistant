import { getStudent } from "@/lib/db/queries";
import { getStudentDossier, renderDossierMarkdown } from "@/lib/render/dossier";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const { studentId } = await params;
  const id = Number(studentId);
  const student = getStudent(id);
  if (!student) {
    return new Response("Student not found", { status: 404 });
  }

  const entries = getStudentDossier(id);
  const markdown = renderDossierMarkdown(student, entries);

  return new Response(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${student.name.replace(/[^a-z0-9]+/gi, "-")}-dossier.md"`,
    },
  });
}
