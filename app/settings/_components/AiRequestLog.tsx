"use client";

import { Fragment, useState, useTransition } from "react";
import type { AiRequestRow } from "@/lib/types";
import { readAiRequestPrompt } from "../actions";

function promptFilename(promptPath: string): string {
  return promptPath.split("/").pop() ?? promptPath;
}

export function AiRequestLog({ requests }: { requests: AiRequestRow[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSelect(id: number) {
    if (selectedId === id) {
      setSelectedId(null);
      setContent(null);
      setError(null);
      return;
    }
    setSelectedId(id);
    setContent(null);
    setError(null);
    startTransition(async () => {
      const result = await readAiRequestPrompt(id);
      if ("error" in result) setError(result.error);
      else setContent(result.content);
    });
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-slate-500">
          <th className="py-2 pr-4 font-medium">When</th>
          <th className="py-2 pr-4 font-medium">Purpose</th>
          <th className="py-2 pr-4 font-medium">Prompt file</th>
        </tr>
      </thead>
      <tbody>
        {requests.map((r) => {
          const expanded = selectedId === r.id;
          return (
            <Fragment key={r.id}>
              <tr
                onClick={() => handleSelect(r.id)}
                className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${
                  expanded ? "bg-slate-50" : ""
                }`}
              >
                <td className="py-2 pr-4 text-slate-600 whitespace-nowrap">{r.created_at}</td>
                <td className="py-2 pr-4">{r.purpose}</td>
                <td className="py-2 pr-4 font-mono text-xs text-slate-500">
                  {promptFilename(r.prompt_file)}
                </td>
              </tr>
              {expanded && (
                <tr className="border-b border-slate-100 bg-slate-50">
                  <td colSpan={3} className="px-4 py-3">
                    {isPending && <p className="text-sm text-slate-500">Loading prompt…</p>}
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    {content !== null && (
                      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-white p-3 font-mono text-xs text-slate-800">
                        {content}
                      </pre>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
