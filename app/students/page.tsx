import Link from "next/link";

import { listStudentsForIndex } from "@/lib/students/overview";
import { StudentIndexClient } from "./_components/StudentIndexClient";

export const dynamic = "force-dynamic";

export default function StudentsIndexPage() {
  const groups = listStudentsForIndex();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Students</h1>
          <p className="mt-2 text-slate-600">
            All students grouped by class, with their latest graded criterion levels.
          </p>
        </div>
      </div>

      {groups.every((g) => g.students.length === 0) ? (
        <p className="text-sm text-slate-500">
          No students yet — add some from the{" "}
          <Link href="/classes" className="underline underline-offset-2">
            Classes page
          </Link>
          .
        </p>
      ) : (
        <StudentIndexClient groups={groups} />
      )}
    </div>
  );
}
