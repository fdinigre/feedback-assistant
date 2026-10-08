"use client";

import { useMemo, useState } from "react";
import type { LearningTargetRow } from "@/lib/types";

export function LearningTargetCombobox({
  name,
  targets,
  defaultValue,
}: {
  name: string;
  targets: LearningTargetRow[];
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    if (!value.trim()) return targets.slice(0, 8);
    const q = value.trim().toLowerCase();
    return targets.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 8);
  }, [value, targets]);

  const isNew =
    value.trim() !== "" &&
    !targets.some((t) => t.name.toLowerCase() === value.trim().toLowerCase());

  return (
    <div className="relative">
      <input
        type="text"
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Learning target"
        autoComplete="off"
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      {open && (matches.length > 0 || isNew) && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow-md">
          {matches.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onMouseDown={() => setValue(t.name)}
                className="block w-full px-3 py-1.5 text-left hover:bg-slate-50"
              >
                {t.name}
              </button>
            </li>
          ))}
          {isNew && (
            <li className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-500">
              Save to create &ldquo;{value.trim()}&rdquo; in the Grade catalog
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
