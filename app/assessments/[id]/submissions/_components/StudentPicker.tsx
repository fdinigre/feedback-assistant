"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { assignStudent } from "../actions";

export type PickerStudent = { id: number; name: string };
export type PickerGroup = { classId: number; className: string; students: PickerStudent[] };

/** Lower case, accents off: "Zoë" is found by typing "zoe". */
function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Every typed word has to appear in the name, in any order: "al ham" finds "Hamad Al-Otaibi". */
export function matchesName(name: string, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const target = fold(name);
  return words.every((w) => target.includes(w));
}

/**
 * Whether every typed word starts a word of the name — "mar" starts "Marisol" but
 * is only inside "Tamar". Such names are listed first: they are the ones meant.
 */
export function startsWords(name: string, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const nameWords = fold(name).split(/[\s'-]+/);
  return words.every((w) => nameWords.some((n) => n.startsWith(w)));
}

export type PickerOption = PickerStudent & { className: string; classId: number };

/**
 * The names a query finds, class by class so the arrow keys walk the list as it
 * is drawn. Within a class, names with a word starting with what was typed come
 * first; otherwise roster order.
 */
export function pickerOptions(groups: PickerGroup[], query: string): PickerOption[] {
  return groups.flatMap((g) => {
    const found = g.students.filter((s) => matchesName(s.name, query));
    const first = found.filter((s) => startsWords(s.name, query));
    return [...first, ...found.filter((s) => !first.includes(s))].map((s) => ({
      ...s,
      className: g.className,
      classId: g.classId,
    }));
  });
}

/**
 * The student a scan belongs to, found by typing part of the name — the list
 * narrows as you type. Arrow keys move through it and Return assigns; a click
 * picks a name for the Assign button. A student who already has a paper in this
 * assessment is greyed, so the ones left are easy to see when a class scan has
 * been split into tests.
 */
export function StudentPicker({
  submissionId,
  groups,
  withPaper,
  absent,
}: {
  submissionId: number;
  groups: PickerGroup[];
  /** Students who already have a scan in this assessment. */
  withPaper: number[];
  /** Students marked absent for it. */
  absent: number[];
}) {
  const listId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const idRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [chosen, setChosen] = useState<PickerStudent | null>(null);

  const hasPaper = useMemo(() => new Set(withPaper), [withPaper]);
  const isAbsent = useMemo(() => new Set(absent), [absent]);
  const showClass = groups.length > 1;

  const options = useMemo(() => pickerOptions(groups, query), [groups, query]);
  // Where the highlight starts: the first student still without a paper, as the
  // one this scan most likely belongs to.
  const firstFree = (list: PickerOption[]) =>
    Math.max(0, list.findIndex((s) => !hasPaper.has(s.id) && !isAbsent.has(s.id)));

  // Keep the highlighted name in sight as the arrow keys move past the list's edge.
  const activeId = open && options[active] ? `${listId}-${options[active].id}` : undefined;
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  function pick(student: PickerStudent, submit: boolean) {
    setChosen(student);
    setQuery(student.name);
    setOpen(false);
    if (submit && idRef.current && formRef.current) {
      // Set before submitting: the state above reaches the hidden field only on
      // the next render, after the form would already have gone.
      idRef.current.value = String(student.id);
      formRef.current.requestSubmit();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = open ? options[active] : chosen;
      if (option) pick(option, true);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <form
      ref={formRef}
      action={assignStudent.bind(null, submissionId)}
      className="flex items-center gap-2"
    >
      <input ref={idRef} type="hidden" name="studentId" value={chosen ? String(chosen.id) : ""} readOnly />
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-label="Student"
          value={query}
          placeholder="Type a student's name…"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            setChosen(null);
            setActive(firstFree(pickerOptions(groups, next)));
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="w-64 rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
        {open && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-64 w-80 overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-md"
          >
            {options.length === 0 && <li className="px-3 py-1.5 text-slate-500">No student by that name.</li>}
            {options.map((s, i) => {
              const startsClass = showClass && (i === 0 || options[i - 1].classId !== s.classId);
              const note = isAbsent.has(s.id) ? "absent" : hasPaper.has(s.id) ? "has a paper" : null;
              return (
                <li key={s.id} role="presentation">
                  {startsClass && (
                    <p className="px-3 pb-0.5 pt-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {s.className}
                    </p>
                  )}
                  <div
                    id={`${listId}-${s.id}`}
                    role="option"
                    aria-selected={i === active}
                    // Picked on mouse-down, before the field's blur closes the list.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(s, false);
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 ${
                      i === active ? "bg-slate-100" : ""
                    } ${note ? "text-slate-400" : "text-slate-800"}`}
                  >
                    <span>{s.name}</span>
                    {note && <span className="text-xs">{note}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <button
        type="submit"
        disabled={!chosen}
        className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
      >
        Assign
      </button>
    </form>
  );
}
