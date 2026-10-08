"use client";

import { useRef, useState } from "react";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const STEP = 0.25;

export function PageViewer({
  submissionId,
  pageCount,
  scratchPages,
}: {
  submissionId: number;
  pageCount: number | null;
  scratchPages: number[] | null;
}) {
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!pageCount) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
        No page images yet for this submission.
      </div>
    );
  }

  const scratchSet = new Set(scratchPages ?? []);
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  function jumpToPage(n: number) {
    scrollRef.current?.querySelector(`[data-page="${n}"]`)?.scrollIntoView({ block: "start" });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
        <span className="text-xs font-medium text-slate-500">Zoom</span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - STEP).toFixed(2)))}
          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
        >
          −
        </button>
        <span className="w-12 text-center text-xs tabular-nums text-slate-600">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + STEP).toFixed(2)))}
          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setZoom(1)}
          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
        >
          Fit
        </button>

        {pages.length > 1 && (
          <span className="ml-auto flex flex-wrap items-center gap-1">
            <span className="text-xs font-medium text-slate-500">Page</span>
            {pages.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => jumpToPage(n)}
                className={
                  scratchSet.has(n)
                    ? "rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                    : "rounded border border-slate-300 px-1.5 py-0.5 text-xs font-medium hover:bg-slate-100"
                }
                title={scratchSet.has(n) ? `Page ${n} — marked as scratch` : `Page ${n}`}
              >
                {n}
              </button>
            ))}
          </span>
        )}
      </div>

      {/* The only scroller on this side. Zoom sets the image's own width rather
          than a transform: a scaled element keeps its original layout box, so
          the old `scale(z)` with `width: 100/z%` cancelled itself out exactly
          and the scan never actually got bigger. */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-4 overflow-auto rounded-lg border border-slate-200 bg-slate-200 p-3"
      >
        {pages.map((n) => (
          <div key={n} data-page={n} className="scroll-mt-2">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Page {n}</span>
              {scratchSet.has(n) && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                  Scratch
                </span>
              )}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/pages/${submissionId}/${n}`}
              alt={`Page ${n}`}
              style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
              className="rounded border border-slate-300 bg-white"
              loading="lazy"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
