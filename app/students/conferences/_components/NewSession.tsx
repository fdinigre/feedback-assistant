"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSessionAction } from "../actions";

export function NewSession({ defaultDate }: { defaultDate: string }) {
  const router = useRouter();
  const [date, setDate] = useState(defaultDate);
  const [label, setLabel] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const id = await createSessionAction(date, label);
          setLabel("");
          router.push(`/students/conferences?session=${id}`);
        });
      }}
    >
      <label className="text-sm">
        <span className="block text-slate-600">New evening</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
      </label>
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Optional label"
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
      >
        Add
      </button>
    </form>
  );
}
