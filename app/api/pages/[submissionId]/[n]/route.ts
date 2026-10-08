import { promises as fs } from "node:fs";
import path from "node:path";

// Serves a single rendered page image from data/pages/<submissionId>/page-<n>.png.
// Next.js does not serve files under data/ (it's outside `public/`), so this
// route reads and streams the PNG directly.

const SAFE_SEGMENT = /^[a-zA-Z0-9_-]+$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ submissionId: string; n: string }> }
) {
  const { submissionId, n } = await params;

  if (!SAFE_SEGMENT.test(submissionId) || !SAFE_SEGMENT.test(n)) {
    return new Response("Invalid path", { status: 400 });
  }

  const filePath = path.join(process.cwd(), "data", "pages", submissionId, `page-${n}.png`);

  try {
    const buffer = await fs.readFile(filePath);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Page image not found", { status: 404 });
  }
}
