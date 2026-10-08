"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ClassGroup } from "@/lib/students/overview";

export function StudentIndexClient({ groups }: { groups: ClassGroup[] }) {
  const [query, setQuery] = useState("");
  const totalStudents = groups.reduce((sum, g) => sum + g.students.length, 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        students: g.students.filter(
          (s) => s.name.toLowerCase().includes(q) || s.pseudonym.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.students.length > 0);
  }, [groups, query]);

  return (
    <div className="space-y-6">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${totalStudents} student${totalStudents === 1 ? "" : "s"} by name...`}
        className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500">No students match &ldquo;{query}&rdquo;.</p>
      ) : (
        filtered.map((g) => (
          // Open while searching: a hit inside a shut group is a hit you cannot see.
          <details key={g.classId} open={query.trim() !== ""} className="group">
            <summary className="cursor-pointer list-none">
              <span className="flex items-baseline gap-2">
                <span className="text-slate-400 transition group-open:rotate-90">▸</span>
                <h2 className="text-lg font-semibold">{g.className}</h2>
                <span className="text-sm text-slate-500">
                  {g.students.length} student{g.students.length === 1 ? "" : "s"}
                </span>
              </span>
            </summary>
            <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
              {g.students.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div>
                    <Link
                      href={`/students/${s.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {s.name}
                    </Link>
                    <p className="text-sm text-slate-500">
                      {g.className} · {s.pseudonym}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {s.latestLevels.length === 0 && !s.latestOther ? (
                      <span className="text-xs italic text-slate-400">no graded work yet</span>
                    ) : (
                      <>
                        {s.latestLevels.map((l) => (
                          <span
                            key={l.criterion}
                            className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
                          >
                            {l.criterion}: {l.level}
                          </span>
                        ))}
                        {s.latestOther && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            {s.latestOther}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </details>
        ))
      )}
    </div>
  );
}
