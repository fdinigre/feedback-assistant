import "server-only";

import { getIaExploration, updateIaExplorationTopic } from "@/lib/db/queries";
import { scrubOutput } from "@/lib/pipeline/guards";

// When the portal has no topic for an exploration, the AI read of the paper (draft
// feedback or final marking) also returns one, taken from the paper itself. It only
// ever fills a blank: a topic the teacher typed is never replaced.

export function needsTopic(topic: string | null | undefined): boolean {
  return !topic || !topic.trim();
}

export const TOPIC_INSTRUCTION = `
TOPIC: the teacher has not recorded this exploration's topic. Add a top-level "topic" string to the
JSON below: the exploration's title as written on the paper, or, if it has no title, a short
description of its aim (at most 12 words). Plain text, never a person's name.
`;

const MAX_LEN = 200;

/** The topic as stored: names scrubbed out, quotes and extra spaces trimmed, kept short. Null when nothing usable. */
export function cleanTopic(raw: unknown, forbiddenNames: string[]): string | null {
  if (typeof raw !== "string") return null;
  let t = scrubOutput(raw, forbiddenNames).text.replace(/\{\{NAME\}\}(['’]s)?/g, "");
  t = t.replace(/\s+/g, " ").trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  if (t.length > MAX_LEN) t = `${t.slice(0, MAX_LEN - 1).trimEnd()}…`;
  return t.length >= 3 ? t : null;
}

/** Saves the topic the AI found, if the exploration still has none (re-read now, in case it was typed meanwhile). */
export function saveExtractedTopic(explorationId: number, raw: unknown, forbiddenNames: string[]): string | null {
  const current = getIaExploration(explorationId);
  if (!current || !needsTopic(current.topic)) return null;
  const topic = cleanTopic(raw, forbiddenNames);
  if (topic) updateIaExplorationTopic(explorationId, topic);
  return topic;
}
