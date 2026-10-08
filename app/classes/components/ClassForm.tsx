"use client";

import { useActionState, useState } from "react";
import {
  createClassAction,
  updateClassAction,
  type ClassFormState,
} from "../actions";
import type { ClassRow, Programme } from "@/lib/types";

const initialState: ClassFormState = { error: null };

const MYP_GRADES = [9, 10, 11, 12];

/** Examples for the course box, so it is clear any wording will do. */
const COURSE_HINT: Record<Programme, string> = {
  MYP: "e.g. Extended, Standard, Financial Math",
  DP: "e.g. AA HL, AI SL",
};

function ProgrammeFields({
  programme,
  onProgrammeChange,
  dpYear,
  grade,
  course,
}: {
  programme: Programme;
  onProgrammeChange: (p: Programme) => void;
  dpYear?: number | null;
  grade?: number;
  course?: string | null;
}) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="programme">
          Programme
        </label>
        <select
          id="programme"
          name="programme"
          required
          value={programme}
          onChange={(e) => onProgrammeChange(e.target.value as Programme)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="MYP">MYP</option>
          <option value="DP">DP</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="course">
          Course <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <input
          id="course"
          name="course"
          defaultValue={course ?? ""}
          maxLength={60}
          placeholder={COURSE_HINT[programme]}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      {programme === "DP" ? (
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="dp_year">
            Year
          </label>
          <select
            id="dp_year"
            name="dp_year"
            required
            defaultValue={dpYear ?? 1}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="1">Year 1 (Grade 11)</option>
            <option value="2">Year 2 (Grade 12)</option>
          </select>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="grade">
            Grade
          </label>
          <select
            id="grade"
            name="grade"
            required
            defaultValue={grade ?? 9}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {MYP_GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}

export function NewClassForm() {
  const [programme, setProgramme] = useState<Programme>("MYP");
  // React resets the form's fields once the action finishes, which puts the
  // programme box back on MYP; the fields shown below have to follow it.
  const [state, formAction, pending] = useActionState(
    async (prev: ClassFormState, formData: FormData) => {
      const result = await createClassAction(prev, formData);
      setProgramme("MYP");
      return result;
    },
    initialState
  );

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="name">
          Class name
        </label>
        <input
          id="name"
          name="name"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="e.g. Grade 9 Math A"
        />
      </div>
      <ProgrammeFields programme={programme} onProgrammeChange={setProgramme} />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add class"}
      </button>
    </form>
  );
}

export function EditClassForm({ cls }: { cls: ClassRow }) {
  const [open, setOpen] = useState(false);
  const [programme, setProgramme] = useState<Programme>(cls.programme);
  const [state, formAction, pending] = useActionState(
    async (prev: ClassFormState, formData: FormData) => {
      const result = await updateClassAction(prev, formData);
      setProgramme(formData.get("programme") === "DP" ? "DP" : "MYP");
      return result;
    },
    initialState
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        Edit
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={cls.id} />
      <input
        name="name"
        defaultValue={cls.name}
        required
        className="w-40 rounded-md border border-slate-300 px-2 py-1 text-sm"
      />
      <select
        name="programme"
        value={programme}
        onChange={(e) => setProgramme(e.target.value as Programme)}
        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
      >
        <option value="MYP">MYP</option>
        <option value="DP">DP</option>
      </select>
      <input
        name="course"
        defaultValue={cls.course ?? ""}
        maxLength={60}
        placeholder={COURSE_HINT[programme]}
        aria-label="Course"
        className="w-44 rounded-md border border-slate-300 px-2 py-1 text-sm"
      />
      {programme === "DP" ? (
        <select
          name="dp_year"
          defaultValue={cls.dp_year ?? 1}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="1">Year 1</option>
          <option value="2">Year 2</option>
        </select>
      ) : (
        <select
          name="grade"
          defaultValue={cls.programme === "MYP" ? cls.grade : 9}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          {MYP_GRADES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-slate-500 hover:text-slate-800"
      >
        Cancel
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
