"use client";

import { useState } from "react";

export function NextStepsChecklist({ steps }: { steps: string[] }) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  if (steps.length === 0) {
    return <p className="text-sm text-slate-500">No actionable steps recorded on that report.</p>;
  }

  return (
    <ul className="space-y-2">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!checked[i]}
            onChange={() => setChecked((c) => ({ ...c, [i]: !c[i] }))}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
          />
          <span className={checked[i] ? "text-slate-400 line-through" : "text-slate-800"}>
            {step}
          </span>
        </li>
      ))}
    </ul>
  );
}
