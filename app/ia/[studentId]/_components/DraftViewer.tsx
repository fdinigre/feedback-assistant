"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { CATEGORY_STYLE, noteDomId, type FeedbackTarget, type TargetCategory } from "@/lib/ia/feedback-targets";
import type { LocatedTarget } from "@/lib/ia/draft-view";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const STEP = 0.25;

/** What the feedback panel needs to offer a "p. N" button that finds a note's highlight. */
export const LocateContext = createContext<{
  located: Record<string, LocatedTarget>;
  locate: (id: string) => void;
} | null>(null);

/** "p. 4 ↗" beside a note whose quote was found on the paper; scrolls the draft to it. */
export function LocateButton({ id }: { id: string }) {
  const ctx = useContext(LocateContext);
  const hit = ctx?.located[id];
  if (!ctx || !hit) return null;
  return (
    <button
      type="button"
      onClick={() => ctx.locate(id)}
      title="Show this on the draft"
      className="ml-1 rounded border border-slate-300 bg-white px-1 py-0 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
    >
      p.&nbsp;{hit.page}&nbsp;↗
    </button>
  );
}

/** Scrolls the draft viewer to a highlight (by target id). */
export function scrollToHighlight(id: string) {
  document.querySelector(`[data-mark-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
}

/** Scrolls the feedback panel to a note (opening the checklist it sits in) and flashes it. */
export function scrollToNote(id: string) {
  const el = document.getElementById(noteDomId(id));
  if (!el) return;
  // Keep the checklists folded: only the one holding this note opens.
  document.querySelectorAll<HTMLDetailsElement>("details[data-checklist]").forEach((d) => {
    if (!d.contains(el)) d.open = false;
  });
  let d = el.closest("details");
  while (d) {
    d.open = true;
    d = d.parentElement?.closest("details") ?? null;
  }
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.add("ring-4", "ring-blue-400");
  window.setTimeout(() => el.classList.remove("ring-4", "ring-blue-400"), 1600);
}

/**
 * The student's draft, page by page, with each located feedback quote highlighted
 * in its criterion's colour and numbered in the margin. Clicking a highlight selects
 * it and shows its note in the feedback panel.
 */
export function DraftViewer({
  documentId,
  pageCount,
  targets,
  located,
  activeId,
  onSelect,
}: {
  documentId: number;
  pageCount: number;
  targets: FeedbackTarget[];
  located: Record<string, LocatedTarget>;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [show, setShow] = useState(true);
  const [hidden, setHidden] = useState<Set<TargetCategory>>(new Set());
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  // What is visible with the current edits and the colour filter, numbered in
  // reading order (page, then down the page) so stepping walks the paper.
  const topOf = (t: { at: LocatedTarget }) => Math.min(...t.at.boxes.map((b) => b[1]));
  const placed = targets.filter((t) => t.visible && located[t.id]).map((t) => ({ ...t, at: located[t.id] }));
  const marks = placed
    .filter((t) => !hidden.has(t.category))
    .sort((a, b) => a.at.page - b.at.page || topOf(a) - topOf(b))
    .map((t, i) => ({ ...t, n: i + 1 }));
  const countBy = (c: TargetCategory) => placed.filter((t) => t.category === c).length;
  const unplaced = targets.filter((t) => t.visible && !located[t.id]).length;
  const activeIndex = marks.findIndex((m) => m.id === activeId);

  function step(delta: number) {
    if (marks.length === 0) return;
    const i = activeIndex < 0 ? (delta > 0 ? 0 : marks.length - 1) : (activeIndex + delta + marks.length) % marks.length;
    onSelect(marks[i].id);
    scrollToHighlight(marks[i].id);
  }

  // J / K (or ] / [) step through the highlights, unless typing in a box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (e.key === "j" || e.key === "]") {
        e.preventDefault();
        step(1);
      } else if (e.key === "k" || e.key === "[") {
        e.preventDefault();
        step(-1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
        <span className="text-xs font-medium text-slate-500">Zoom</span>
        <button type="button" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - STEP).toFixed(2)))} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100" aria-label="Zoom out">−</button>
        <span className="w-12 text-center text-xs tabular-nums text-slate-600">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + STEP).toFixed(2)))} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100" aria-label="Zoom in">+</button>
        <button type="button" onClick={() => setZoom(1)} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100">Fit</button>
        <label className="ml-2 flex items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Highlights
        </label>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => step(-1)} disabled={marks.length === 0} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-40" title="Previous highlight (K)" aria-label="Previous highlight">◀</button>
          <span className="min-w-14 text-center text-xs tabular-nums text-slate-600">
            {activeIndex >= 0 ? activeIndex + 1 : "–"} / {marks.length}
          </span>
          <button type="button" onClick={() => step(1)} disabled={marks.length === 0} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-40" title="Next highlight (J)" aria-label="Next highlight">▶</button>
        </span>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
        <span className="text-slate-500">Show:</span>
        {(Object.keys(CATEGORY_STYLE) as TargetCategory[]).map((c) => {
          const on = !hidden.has(c);
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setHidden((prev) => {
                  const next = new Set(prev);
                  if (next.has(c)) next.delete(c);
                  else next.add(c);
                  return next;
                })
              }
              title={`${on ? "Hide" : "Show"} ${CATEGORY_STYLE[c].name}`}
              className={
                "flex items-center gap-1 rounded-full border px-2 py-0.5 " +
                (on ? "border-slate-400 bg-white text-slate-700" : "border-slate-200 bg-slate-100 text-slate-400 line-through")
              }
            >
              <span className="inline-block h-2.5 w-2.5 rounded-sm border border-slate-400" style={{ background: on ? CATEGORY_STYLE[c].hex : "transparent" }} />
              {c === "M" ? "Math" : c} <span className="tabular-nums">{countBy(c)}</span>
            </button>
          );
        })}
        {hidden.size > 0 && (
          <button type="button" onClick={() => setHidden(new Set())} className="underline">
            Show all
          </button>
        )}
        <span className="ml-auto text-slate-400">J / K steps through highlights</span>
      </div>
      {unplaced > 0 && (
        <p className="shrink-0 text-xs text-slate-500">
          {unplaced} note{unplaced === 1 ? "" : "s"} could not be placed on a page (the quote was not found in the PDF&rsquo;s text) — they are still in the feedback.
        </p>
      )}

      <div className="min-h-0 flex-1 space-y-4 overflow-auto rounded-lg border border-slate-200 bg-slate-200 p-3">
        {pages.map((n) => (
          <div key={n} data-page={n}>
            <p className="mb-1 text-xs font-medium text-slate-500">Page {n}</p>
            <div className="relative inline-block" style={{ width: `${zoom * 100}%` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/ia/draft-page/${documentId}/${n}`}
                alt={`Draft page ${n}`}
                className="block w-full rounded border border-slate-300 bg-white"
                loading="lazy"
              />
              {show &&
                marks
                  .filter((m) => m.at.page === n)
                  .map((m) => {
                    const color = CATEGORY_STYLE[m.category].hex;
                    const active = m.id === activeId;
                    const top = Math.min(...m.at.boxes.map((b) => b[1]));
                    return (
                      <div key={m.id} data-mark-id={m.id}>
                        {m.at.boxes.map((b, k) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => onSelect(m.id)}
                            title={`${m.n}. ${m.label}`}
                            aria-label={`Highlight ${m.n}: ${m.label}`}
                            className="absolute cursor-pointer rounded-sm mix-blend-multiply"
                            style={{
                              left: `${b[0] * 100}%`,
                              top: `${b[1] * 100}%`,
                              width: `${(b[2] - b[0]) * 100}%`,
                              height: `${(b[3] - b[1]) * 100}%`,
                              background: color,
                              opacity: active ? 0.75 : 0.45,
                              outline: active ? "2px solid #1e3a8a" : "none",
                            }}
                          />
                        ))}
                        <button
                          type="button"
                          onClick={() => onSelect(m.id)}
                          aria-label={`Note ${m.n}`}
                          className="absolute flex h-4 min-w-4 items-center justify-center rounded px-0.5 text-[10px] font-semibold text-slate-900 shadow-sm"
                          style={{ right: "1.5%", top: `${top * 100}%`, background: color, outline: active ? "2px solid #1e3a8a" : "none" }}
                        >
                          {m.n}
                        </button>
                      </div>
                    );
                  })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
