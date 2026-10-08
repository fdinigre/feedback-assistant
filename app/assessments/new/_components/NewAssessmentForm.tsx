"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { createAssessment, type FormState } from "@/lib/assessment/actions";
import { ALL_CRITERIA } from "@/lib/assessment/criteria";
import { classLabel } from "@/lib/assessment/course";
import type { ClassRow, Criterion, Programme } from "@/lib/types";

const initialState: FormState = { error: null };

const CHOICES: { value: Programme; label: string }[] = [
  { value: "MYP", label: "MYP" },
  { value: "DP", label: "DP" },
];

/** How an MYP task is marked: levels on the criteria, or a score out of a total. */
type MypMarking = "criteria" | "points";

export function NewAssessmentForm({ classes }: { classes: ClassRow[] }) {
  const [state, formAction, pending] = useActionState(createAssessment, initialState);
  const [programme, setProgramme] = useState<Programme>("MYP");
  const [marking, setMarking] = useState<MypMarking>("criteria");
  const [criteria, setCriteria] = useState<Criterion[]>([]);

  // The class carries the grade and programme, so picking a class is what
  // determines who sits this assessment — no separate grade field to disagree with it.
  const available = useMemo(
    () =>
      classes.filter((c) => c.programme === programme),
    [classes, programme]
  );

  const cAloneError =
    programme === "MYP" && marking === "criteria" && criteria.includes("C") && criteria.length < 2
      ? "Criterion C can never be selected alone — pair it with another criterion (A, B, or D)."
      : null;

  function toggle(c: Criterion) {
    setCriteria((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight">New assessment</h1>

      <form action={formAction} className="mt-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700">Title</label>
          <input
            name="title"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <fieldset>
          <legend className="block text-sm font-medium text-slate-700">Programme</legend>
          <div className="mt-2 flex gap-4">
            {CHOICES.map((p) => (
              <label key={p.value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="programme"
                  value={p.value}
                  checked={programme === p.value}
                  onChange={() => setProgramme(p.value)}
                />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label className="block text-sm font-medium text-slate-700">Class</label>
          {available.length === 0 ? (
            <p className="mt-1 text-sm text-slate-600">
              No {programme} classes yet —{" "}
              <Link href="/classes" className="font-medium text-slate-900 underline">
                create one first
              </Link>
              .
            </p>
          ) : (
            <select
              name="class_id"
              required
              defaultValue=""
              key={programme}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Select class
              </option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {classLabel(c)}
                </option>
              ))}
            </select>
          )}
          <p className="mt-1 text-xs text-slate-500">
            Only this class&apos;s students appear when you upload and assign scans.
          </p>
        </div>

        {programme === "MYP" ? (
          <>
            <fieldset>
              <legend className="block text-sm font-medium text-slate-700">How it is marked</legend>
              <div className="mt-2 space-y-2">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="marking"
                    checked={marking === "criteria"}
                    onChange={() => setMarking("criteria")}
                    className="mt-1"
                  />
                  <span>
                    On the criteria
                    <span className="block text-xs text-slate-500">
                      A level for each criterion assessed, from its descriptors.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="marking"
                    checked={marking === "points"}
                    onChange={() => setMarking("points")}
                    className="mt-1"
                  />
                  <span>
                    Points test
                    <span className="block text-xs text-slate-500">
                      A score out of the total with feedback on each question, and no criterion
                      level. You scan the blank test and approve a proposed answer key first.
                    </span>
                  </span>
                </label>
              </div>
              {marking === "points" && <input type="hidden" name="assessment_type" value="fm_test" />}
            </fieldset>

            {marking === "criteria" && (
              <fieldset>
                <legend className="block text-sm font-medium text-slate-700">Criteria assessed</legend>
                <div className="mt-2 flex gap-4">
                  {ALL_CRITERIA.map((c) => (
                    <label key={c} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name={`criterion_${c}`}
                        checked={criteria.includes(c)}
                        onChange={() => toggle(c)}
                      />
                      Criterion {c}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Criterion C can never be selected alone — it is always assessed alongside another
                  criterion.
                </p>
                {cAloneError && <p className="mt-2 text-sm text-red-600">{cAloneError}</p>}
              </fieldset>
            )}
          </>
        ) : (
          <div>
            <label className="block text-sm font-medium text-slate-700">Assessment type</label>
            <select
              name="assessment_type"
              required
              defaultValue=""
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Select type
              </option>
              <option value="quiz">Quiz (formative)</option>
              <option value="unit_test">Unit test (summative)</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Both go through the same full pipeline — marking, boundaries, and report.
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700">Date</label>
          <input
            type="date"
            name="date"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending || !!cAloneError || available.length === 0}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create assessment"}
          </button>
          <Link href="/assessments" className="text-sm text-slate-600 hover:underline">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
