import "server-only";

import { getReport } from "@/lib/db/queries";
import { listGradedSubmissions } from "@/lib/students/shared";
import {
  ATL_LEVELS,
  atlLevelIndex,
  isAtlCluster,
  isAtlLevel,
  type AtlCluster,
  type AtlLevel,
} from "@/lib/atl/rubric";

/**
 * Where a student sits on the Self-Direction scale, built from the ATL skill
 * each report named rather than from a spreadsheet somebody typed.
 *
 * Only approved reports count. A draft is a thing the tool wrote that nobody has
 * agreed with yet, and this feeds a report card.
 */

export type AtlObservation = {
  assessmentTitle: string;
  date: string | null;
  level: AtlLevel;
  /** The teacher-facing note. Never shown to a student or a parent. */
  evidence: string;
};

export type AtlStanding = {
  cluster: AtlCluster;
  /** Oldest first. */
  observations: AtlObservation[];
  /** The most recent level on record. */
  current: AtlLevel;
  /** Against the one before it, where there is one. */
  trend: "up" | "down" | "same" | null;
};

export function computeAtlHistory(studentId: number): AtlStanding[] {
  const byCluster = new Map<AtlCluster, AtlObservation[]>();

  for (const { assessment, submission } of listGradedSubmissions(studentId)) {
    const report = getReport(submission.id);
    if (!report || report.status !== "approved") continue;
    const focus = report.sections.atlFocus;
    if (!focus || !isAtlCluster(focus.cluster) || !isAtlLevel(focus.level)) continue;

    const list = byCluster.get(focus.cluster) ?? [];
    list.push({
      assessmentTitle: assessment.title,
      date: assessment.date,
      level: focus.level,
      evidence: focus.evidence,
    });
    byCluster.set(focus.cluster, list);
  }

  return [...byCluster.entries()]
    .map(([cluster, observations]) => {
      const current = observations[observations.length - 1].level;
      const previous = observations[observations.length - 2]?.level;
      const trend = previous
        ? atlLevelIndex(current) > atlLevelIndex(previous)
          ? ("up" as const)
          : atlLevelIndex(current) < atlLevelIndex(previous)
            ? ("down" as const)
            : ("same" as const)
        : null;
      return { cluster, observations, current, trend };
    })
    .sort((a, b) => atlLevelIndex(a.current) - atlLevelIndex(b.current));
}

/** How many of the four rungs this is, for drawing the scale. */
export const ATL_SCALE_LENGTH = ATL_LEVELS.length;
