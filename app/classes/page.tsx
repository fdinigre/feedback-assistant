import { courseLabel } from "@/lib/assessment/course";
import Link from "next/link";
import { listClasses, listStudents, getClassDataFootprint } from "@/lib/db/queries";
import { NewClassForm, EditClassForm } from "./components/ClassForm";
import { DeleteClassButton } from "./components/DeleteClassButton";

// Reads the database on every request: this list must never be served from a
// static render, or a class or assessment added later would not show up.
export const dynamic = "force-dynamic";

export default function ClassesPage() {
  const classes = listClasses();
  const counts = new Map(classes.map((c) => [c.id, listStudents(c.id).length]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Classes</h1>
        <p className="mt-2 text-slate-600">
          Manage class rosters and imported MAP/CAT4 data for your students here.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Your classes</h2>
        {classes.length === 0 ? (
          <p className="text-sm text-slate-500">No classes yet — create one below.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
            {classes.map((c) => {
              const count = counts.get(c.id) ?? 0;
              return (
                <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/classes/${c.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {c.name}
                      </Link>
                      <ProgrammeBadge programme={c.programme} />
                    </div>
                    <p className="text-sm text-slate-500">
                      {courseLabel(c)}{" "}
                      · {count} student{count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <EditClassForm cls={c} />
                    <DeleteClassButton
                      classId={c.id}
                      className={c.name}
                      footprint={getClassDataFootprint(c.id)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="max-w-sm space-y-3">
        <h2 className="text-lg font-medium">Add a class</h2>
        <NewClassForm />
      </section>
    </div>
  );
}

function ProgrammeBadge({ programme }: { programme: "MYP" | "DP" }) {
  return (
    <span
      className={
        programme === "DP"
          ? "rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800"
          : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
      }
    >
      {programme}
    </span>
  );
}
