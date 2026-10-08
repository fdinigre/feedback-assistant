import {
  EVIDENCEABLE_CLUSTERS,
  atlCommentRule,
  atlFocusJsonShape,
  isAtlCluster,
  isAtlLevel,
} from "@/lib/atl/rubric";
import { scrubOutput } from "@/lib/pipeline/guards";
import type { ReportSections } from "@/lib/types";

export { atlCommentRule, atlFocusJsonShape };

/**
 * Only a cluster and level that are actually on the school's rubric survive. An
 * invented one would go straight onto a report card, so a near miss is dropped
 * rather than coerced into the nearest real value.
 */
export function parseAtlFocus(value: unknown, forbidden: string[]): ReportSections["atlFocus"] {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!isAtlCluster(raw.cluster) || !isAtlLevel(raw.level)) return null;
  if (!EVIDENCEABLE_CLUSTERS.includes(raw.cluster)) return null;
  return {
    cluster: raw.cluster,
    level: raw.level,
    evidence: scrubOutput(String(raw.evidence ?? ""), forbidden).text,
  };
}
