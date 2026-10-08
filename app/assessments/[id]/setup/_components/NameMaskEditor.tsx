"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveNameMasks } from "@/lib/assessment/actions";
import type { NameMask } from "@/lib/types";

type Rect = { x: number; y: number; w: number; h: number };

/** Where the preview image comes from: the blank paper, or a student's scan. */
type PreviewSource =
  | { kind: "paper"; assessmentId: number; pageCount: number }
  | { kind: "scan"; submissionId: number | null; pageCount: number };

const DEFAULT_P1: Rect = { x: 0, y: 0, w: 1, h: 0.15 };
const DEFAULT_P2: Rect = { x: 0, y: 0, w: 1, h: 0.12 };

function rectOf(m: NameMask): Rect {
  return { x: m.x, y: m.y, w: m.w, h: m.h };
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function NameMaskEditor({
  assessmentId,
  masks,
  previewSubmissionId,
  previewPageCount,
  paperPageCount,
}: {
  assessmentId: number;
  masks: NameMask[];
  previewSubmissionId: number | null;
  previewPageCount: number;
  /** Pages in the uploaded blank paper; 0 when there isn't one to render. */
  paperPageCount: number;
}) {
  // The mask describes where the name field sits on the PAPER, so preview it
  // against the blank paper the questions were extracted from. A student scan
  // is the fallback for assessments uploaded before a paper was required.
  const source: PreviewSource =
    paperPageCount > 0
      ? { kind: "paper", assessmentId, pageCount: paperPageCount }
      : { kind: "scan", submissionId: previewSubmissionId, pageCount: previewPageCount };
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const initialP1 = masks.find((m) => m.page === 1) ?? null;
  const initialP2 = masks.find((m) => m.page !== 1) ?? null;

  const [p1, setP1] = useState<Rect>(initialP1 ? rectOf(initialP1) : DEFAULT_P1);
  const [p2enabled, setP2enabled] = useState<boolean>(!!initialP2);
  const [p2page, setP2page] = useState<number>(initialP2?.page ?? 2);
  const [p2, setP2] = useState<Rect>(initialP2 ? rectOf(initialP2) : DEFAULT_P2);

  function save() {
    setMessage(null);
    const out: NameMask[] = [{ page: 1, ...p1 }];
    if (p2enabled) {
      const page = Math.max(2, Math.round(p2page) || 2);
      out.push({ page, ...p2 });
    }
    startTransition(async () => {
      const res = await saveNameMasks(assessmentId, out);
      if (res.error) setMessage({ text: res.error, error: true });
      else {
        setMessage({ text: "Saved — masks applied to every uploaded scan.", error: false });
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-4 space-y-6">
      <MaskSlot
        title="Page 1 (required)"
        rect={p1}
        onChange={setP1}
        source={source}
        page={1}

      />

      <div className="rounded-md border border-slate-200 p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <input
            type="checkbox"
            checked={p2enabled}
            onChange={(e) => setP2enabled(e.target.checked)}
            className="h-4 w-4"
          />
          Also mask a second page
        </label>
        <p className="mt-1 text-sm text-slate-600">
          Turn this on if the name is repeated on another page (e.g. a header on page 2). That page&rsquo;s
          image is then masked too before it&rsquo;s sent to the AI.
        </p>

        {p2enabled && (
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700">Page number</label>
              <input
                type="number"
                min={2}
                step={1}
                value={p2page}
                onChange={(e) => setP2page(Number(e.target.value))}
                className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
            <div className="mt-3">
              <MaskSlot
                title={`Page ${p2page}`}
                rect={p2}
                onChange={setP2}
                source={source}
                page={Math.max(2, Math.round(p2page) || 2)}
        
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save name mask"}
        </button>
        {message && (
          <p className={`text-sm ${message.error ? "text-rose-700" : "text-emerald-700"}`}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}

function MaskSlot({
  title,
  rect,
  onChange,
  source,
  page,
}: {
  title: string;
  rect: Rect;
  onChange: (r: Rect) => void;
  source: PreviewSource;
  page: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="X (left, 0-1)" value={rect.x} onChange={(v) => onChange({ ...rect, x: v })} />
          <NumberField label="Y (top, 0-1)" value={rect.y} onChange={(v) => onChange({ ...rect, y: v })} />
          <NumberField label="Width" value={rect.w} onChange={(v) => onChange({ ...rect, w: v })} />
          <NumberField label="Height" value={rect.h} onChange={(v) => onChange({ ...rect, h: v })} />
        </div>
        <p className="text-xs text-slate-500">
          Drag the box on the preview to move it, or drag its bottom-right corner to resize — the
          numbers update as you go.
        </p>
      </div>
      <div className="flex items-start justify-center">
        <MaskPreview source={source} page={page} rect={rect} onChange={onChange} />
      </div>
    </div>
  );
}

function MaskPreview({
  source,
  page,
  rect,
  onChange,
}: {
  source: PreviewSource;
  page: number;
  rect: Rect;
  onChange: (r: Rect) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [imgError, setImgError] = useState(false);

  const available = source.kind === "paper" || source.submissionId != null;
  const hasImage = available && page <= source.pageCount && !imgError;
  const imageSrc =
    source.kind === "paper"
      ? `/api/paper-pages/${source.assessmentId}/${page}`
      : `/api/pages/${source.submissionId}/${page}`;

  function startDrag(e: React.PointerEvent, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const orig = rect;
    const startX = e.clientX;
    const startY = e.clientY;

    function onMove(ev: PointerEvent) {
      const dx = (ev.clientX - startX) / box.width;
      const dy = (ev.clientY - startY) / box.height;
      if (mode === "move") {
        onChange({
          w: orig.w,
          h: orig.h,
          x: clamp(orig.x + dx, 0, 1 - orig.w),
          y: clamp(orig.y + dy, 0, 1 - orig.h),
        });
      } else {
        onChange({
          x: orig.x,
          y: orig.y,
          w: clamp(orig.w + dx, 0.02, 1 - orig.x),
          h: clamp(orig.h + dy, 0.02, 1 - orig.y),
        });
      }
    }
    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  return (
    <div
      ref={ref}
      className="relative w-full max-w-[16rem] overflow-hidden border border-slate-400 bg-white"
      style={hasImage ? undefined : { aspectRatio: "8.5 / 11" }}
    >
      {hasImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt={
            source.kind === "paper"
              ? `Page ${page} of the blank exam paper`
              : `Page ${page} of a sample scan`
          }
          draggable={false}
          onError={() => setImgError(true)}
          className="block w-full select-none"
        />
      )}
      <div
        role="button"
        tabIndex={0}
        onPointerDown={(e) => startDrag(e, "move")}
        className="absolute cursor-move touch-none bg-slate-900/70"
        style={{
          left: `${rect.x * 100}%`,
          top: `${rect.y * 100}%`,
          width: `${rect.w * 100}%`,
          height: `${rect.h * 100}%`,
        }}
      >
        <div
          onPointerDown={(e) => startDrag(e, "resize")}
          className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize touch-none border border-slate-600 bg-white"
        />
      </div>
      {!hasImage && (
        <span className="absolute bottom-1 right-1 text-[10px] text-slate-400">
          {!available
            ? "upload the exam paper to preview"
            : page > source.pageCount
              ? `${source.kind === "paper" ? "the paper has" : "sample scan has"} ${source.pageCount} page${source.pageCount === 1 ? "" : "s"}`
              : "page outline"}
        </span>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600">{label}</label>
      <input
        type="number"
        value={Number(value.toFixed(3))}
        min={0}
        max={1}
        step={0.01}
        onChange={(e) => onChange(clamp(Number(e.target.value), 0, 1))}
        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
      />
    </div>
  );
}
