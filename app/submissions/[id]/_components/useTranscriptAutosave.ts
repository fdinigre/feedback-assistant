"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SaveStatus, TranscriptQuestion } from "@/lib/types";

const DELAY_MS = 800;

export type TranscriptSaveState = { saving: boolean; status: SaveStatus | undefined };

/**
 * Saves a question's transcript by itself, a moment after the teacher stops
 * changing it — there used to be a Save button, and edits made without pressing
 * it were lost on leaving the page.
 *
 * `markDirty(questionId)` is called by every edit; the save happens once the new
 * transcript has rendered, from the latest content, so a burst of typing is one
 * request. What the server returns is not written back into the fields: the
 * teacher may have typed more while it was on its way. Leaving — the next or
 * previous paper, another page, closing or hiding the tab — sends anything still
 * waiting.
 */
export function useTranscriptAutosave(
  submissionId: number,
  transcriptMap: Record<number, TranscriptQuestion>
) {
  const latest = useRef(transcriptMap);
  const dirty = useRef(new Set<number>());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [status, setStatus] = useState<Record<number, SaveStatus | undefined>>({});

  const save = useCallback(
    async (questionId: number, keepalive = false) => {
      clearTimeout(timers.current.get(questionId));
      timers.current.delete(questionId);
      dirty.current.delete(questionId);
      const content = latest.current[questionId];
      if (!content) return;
      if (!keepalive) {
        setSaving((s) => ({ ...s, [questionId]: true }));
        setStatus((s) => ({ ...s, [questionId]: undefined }));
      }
      try {
        const res = await fetch("/api/review/transcript", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submissionId, questionId, content, mode: "autosave" }),
          keepalive,
        });
        if (keepalive) return;
        if (res.ok) {
          setStatus((s) => ({ ...s, [questionId]: { kind: "success" } }));
        } else {
          const json = await res.json().catch(() => null);
          setStatus((s) => ({
            ...s,
            [questionId]: {
              kind: "error",
              message: (json && (json.error as string)) ?? `Couldn't save (${res.status}).`,
            },
          }));
        }
      } catch {
        if (keepalive) return;
        setStatus((s) => ({
          ...s,
          [questionId]: { kind: "error", message: "Couldn't reach the app — not saved yet." },
        }));
      } finally {
        if (!keepalive) setSaving((s) => ({ ...s, [questionId]: false }));
      }
    },
    [submissionId]
  );

  // Every change to the transcripts reschedules the questions that were edited.
  useEffect(() => {
    latest.current = transcriptMap;
    for (const questionId of dirty.current) {
      clearTimeout(timers.current.get(questionId));
      timers.current.set(
        questionId,
        setTimeout(() => void save(questionId), DELAY_MS)
      );
    }
  }, [transcriptMap, save]);

  // Leaving sends what is still waiting. Closing the tab or loading another page
  // goes by beacon, the one request a browser reliably lets outlive the page (a
  // fetch sent from pagehide, even with keepalive, was dropped). Hiding the tab
  // counts as leaving too — a hidden tab may never come back. Moving to another
  // paper within the app unmounts this screen with the page still alive, so an
  // ordinary request does.
  useEffect(() => {
    // The one Set for this screen's life, read at whatever moment the page is left.
    const pending = dirty.current;
    const beaconAll = () => {
      for (const questionId of [...pending]) {
        const content = latest.current[questionId];
        clearTimeout(timers.current.get(questionId));
        timers.current.delete(questionId);
        pending.delete(questionId);
        if (!content) continue;
        navigator.sendBeacon(
          "/api/review/transcript",
          new Blob([JSON.stringify({ submissionId, questionId, content, mode: "autosave" })], {
            type: "application/json",
          })
        );
      }
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") beaconAll();
    };
    window.addEventListener("pagehide", beaconAll);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", beaconAll);
      document.removeEventListener("visibilitychange", onHidden);
      for (const questionId of [...pending]) void save(questionId, true);
    };
  }, [save, submissionId]);

  const markDirty = useCallback((questionId: number) => {
    dirty.current.add(questionId);
  }, []);

  /** For "Try again" after a failed save: send it now. */
  const saveNow = useCallback((questionId: number) => void save(questionId), [save]);

  const stateOf = (questionId: number): TranscriptSaveState => ({
    saving: !!saving[questionId],
    status: status[questionId],
  });

  return { markDirty, saveNow, stateOf };
}
