import fs from "node:fs";
import path from "node:path";
import { getIaDocument } from "@/lib/db/queries";
import { iaDocumentsDir } from "@/lib/ia/paths";
import { rasterizePdfPage } from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ia/draft-page/<documentId>/<n> — page n of an uploaded IA PDF, rendered
 * once on this computer and kept under data/ia/<explorationId>/view-<documentId>/.
 * These are the original pages, for the teacher's own screen: they are never
 * sent to the AI (the math check uses the separately redacted pages-<id>/ images).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string; n: string }> }
) {
  const { documentId, n } = await params;
  if (!/^\d+$/.test(documentId) || !/^\d+$/.test(n)) return new Response("Invalid path", { status: 400 });
  const doc = getIaDocument(Number(documentId));
  const filePath = doc?.file_path;
  if (!doc || !filePath || path.extname(filePath).toLowerCase() !== ".pdf" || !fs.existsSync(filePath)) {
    return new Response("Not found", { status: 404 });
  }
  const out = path.join(iaDocumentsDir(doc.exploration_id), `view-${doc.id}`, `page-${Number(n)}.png`);
  try {
    if (!fs.existsSync(out)) rasterizePdfPage(filePath, Number(n), out);
    return new Response(new Uint8Array(fs.readFileSync(out)), {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return new Response("Page not found", { status: 404 });
  }
}
