"use client";

import { useMemo, useRef, useState } from "react";
import type { RosterOption } from "../actions";

/**
 * "Who is this?" as a type-ahead rather than a list of seventy-five.
 *
 * It opens pre-filtered on whichever word of the written name finds somebody —
 * usually the surname, which is usually the part the two spellings share, so
 * "Bobby Okonkwo" opens on Robert Okonkwo and "Valentina Ross" on Jamie
 * Ross. If no word finds anyone the filter is dropped rather than showing an
 * empty list, because a name matching nothing is exactly when the whole roster
 * is wanted.
 *
 * Hand-rolled because this app has no component library, and a native
 * <datalist> gives back a string that then has to be mapped to a student —
 * which is the one step that must not be approximate.
 */

/** Diacritics off and lower-cased, so "Zoe" finds "Zoë". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * The word to open the list on: each word of the written name, longest first,
 * and the first that actually finds somebody wins. Longest alone is not enough
 * — "Valentina Ross" has a longer first name than surname, and it is "Ross" that
 * finds the student.
 */
function seedQuery(writtenName: string, options: RosterOption[]): string {
  const words = writtenName
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .sort((a, b) => b.length - a.length);
  for (const word of words) {
    if (options.some((o) => fold(o.name).includes(fold(word)))) return word;
  }
  return "";
}

export function StudentPicker({
  writtenName,
  options,
  disabled,
  onPick,
}: {
  writtenName: string;
  options: RosterOption[];
  disabled?: boolean;
  onPick: (studentId: number) => void;
}) {
  const [query, setQuery] = useState(() => seedQuery(writtenName, options));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const matches = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return options;
    const hits = options.filter((o) => fold(`${o.name} ${o.className}`).includes(q));
    // A name that STARTS with what was typed comes first. "Ross" otherwise
    // offers Jamie Ross above Ross Lindqvist, and the cost of picking the wrong one
    // here is a parent being shown another child's grades.
    const rank = (o: RosterOption) => {
      const name = fold(o.name);
      if (name.startsWith(q)) return 0;
      if (name.split(" ").some((w) => w.startsWith(q))) return 1;
      return 2;
    };
    return [...hits].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [options, query]);

  function pick(option: RosterOption | undefined) {
    if (!option) return;
    setOpen(false);
    onPick(option.id);
  }

  return (
    <span className="relative inline-block">
      <input
        type="text"
        value={query}
        disabled={disabled}
        placeholder="who is this?"
        aria-label={`Which student is ${writtenName}?`}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // A click on an option fires after blur, so let it land first.
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(matches[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="w-52 rounded border border-slate-300 px-2 py-1 text-sm"
      />
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-20 mt-1 max-h-64 w-72 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">No student matches that.</li>
          ) : (
            matches.map((option, i) => (
              <li key={option.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={() => {
                    // Beat the blur timer: this is a real choice, not a dismissal.
                    if (blurTimer.current) clearTimeout(blurTimer.current);
                  }}
                  onClick={() => pick(option)}
                  className={`block w-full px-3 py-1.5 text-left text-sm ${
                    i === active ? "bg-slate-100" : "hover:bg-slate-50"
                  }`}
                >
                  {option.name}
                  <span className="ml-2 text-xs text-slate-500">{option.className}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </span>
  );
}
