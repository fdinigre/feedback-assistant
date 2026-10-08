"use client";

/** Opens the browser's print dialog, and takes itself out of what gets printed. */
export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 print:hidden"
    >
      {label}
    </button>
  );
}
