import "server-only";

import path from "node:path";
import { ensureDir } from "@/lib/intake/paths";

const DATA_DIR = path.join(process.cwd(), "data");

/** data/ia/<explorationId>/ — original uploaded draft/final files. */
export function iaDocumentsDir(explorationId: number): string {
  const dir = path.join(DATA_DIR, "ia", String(explorationId));
  ensureDir(dir);
  return dir;
}

/** data/ia/<explorationId>/pages-<documentId>/ — name-redacted page images of one uploaded PDF. */
export function iaPagesDir(explorationId: number, documentId: number): string {
  const dir = path.join(DATA_DIR, "ia", String(explorationId), `pages-${documentId}`);
  ensureDir(dir);
  return dir;
}
