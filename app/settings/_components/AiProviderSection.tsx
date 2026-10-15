"use client";

import { useEffect, useState, useTransition } from "react";
import { aiAccountsAction, saveAiProviderAction } from "../actions";
import type { AccountStatus } from "@/lib/ai/gemini";

type Provider = "gemini" | "claude";

const CHOICES: { value: Provider; title: string; detail: string }[] = [
  {
    value: "gemini",
    title: "Gemini",
    detail: "Your @thekaustschool.org Google account — the one the school has approved for student work.",
  },
  {
    value: "claude",
    title: "Claude",
    detail: "Your own Claude Pro or Max account — for when Gemini's allowance runs out.",
  },
];

/** One line saying who an AI is signed in as, or what to do about it. */
function describe(provider: Provider, status: AccountStatus | null | undefined): { text: string; ok: boolean } {
  if (status === undefined) return { text: "Checking the sign-in…", ok: true };
  if (status === null) return { text: "", ok: true };
  const plan = status.plan ? ` (${status.plan.charAt(0).toUpperCase()}${status.plan.slice(1)})` : "";
  switch (status.state) {
    case "ok":
      return { text: `Signed in as ${status.email ?? "an account it didn't name"}${plan}`, ok: true };
    case "wrong-account":
      return {
        text: `Signed in as ${status.email}, which isn't a school account — student work won't be sent. Run Install Feedback Assistant again and sign in with your school account.`,
        ok: false,
      };
    case "not-signed-in":
      return {
        text:
          provider === "claude"
            ? "Not signed in. In Terminal, run  ~/.local/bin/claude auth login  and sign in once."
            : "Not signed in. Run Install Feedback Assistant again and take the sign-in step.",
        ok: false,
      };
    case "not-installed":
      return {
        text:
          provider === "claude"
            ? "Not installed on this Mac. In Terminal, run  curl -fsSL https://claude.ai/install.sh | bash  then  ~/.local/bin/claude auth login  — it needs a Claude Pro or Max account."
            : "Google's Antigravity command (agy) isn't installed on this Mac. Run Install Feedback Assistant again.",
        ok: false,
      };
    default:
      return { text: `Couldn't check the sign-in${status.message ? `: ${status.message}` : "."}`, ok: false };
  }
}

/**
 * Which AI reads and marks the work, and who it is signed in as. A switch takes
 * effect on the next request. Every copy starts on its installer's choice —
 * Gemini on a colleague's — and Claude is there for when Gemini's allowance runs out.
 */
export function AiProviderSection({ current }: { current: Provider }) {
  const [provider, setProvider] = useState<Provider>(current);
  const [accounts, setAccounts] = useState<Record<Provider, AccountStatus> | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    aiAccountsAction()
      .then((a) => live && setAccounts(a))
      .catch(() =>
        live && setAccounts({ gemini: { state: "error", email: null }, claude: { state: "error", email: null } })
      );
    return () => {
      live = false;
    };
  }, []);

  function choose(next: Provider) {
    if (next === provider) return;
    const previous = provider;
    setProvider(next);
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const res = await saveAiProviderAction(next);
      if (res.error) {
        setError(res.error);
        setProvider(previous);
      } else {
        setSaved(true);
      }
    });
  }

  return (
    <section>
      <h2 className="text-lg font-medium">AI</h2>
      <p className="mt-1 text-sm text-slate-600">
        Which AI reads and marks the work. A switch takes effect from the next AI request — nothing
        has to restart. Names are replaced with codes and page 1 is masked either way.
      </p>
      <div className="mt-3 divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
        {CHOICES.map((c) => {
          const line = describe(c.value, accounts === undefined ? undefined : accounts[c.value]);
          const selected = provider === c.value;
          return (
            <label
              key={c.value}
              className={`flex cursor-pointer items-start gap-3 p-4 ${selected ? "bg-slate-50" : ""}`}
            >
              <input
                type="radio"
                name="ai_provider"
                value={c.value}
                checked={selected}
                disabled={pending}
                onChange={() => choose(c.value)}
                className="mt-1"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900">
                  {c.title}
                  {selected && <span className="ml-2 text-xs font-normal text-slate-500">in use</span>}
                </span>
                <span className="block text-xs text-slate-500">{c.detail}</span>
                {line.text && (
                  <span className={`mt-1 block text-xs ${line.ok ? "text-emerald-700" : "text-amber-800"}`}>
                    {line.text}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      {provider === "claude" && (
        <p className="mt-2 text-xs text-slate-500">
          Student work now goes to your Claude account rather than the school&apos;s approved Google
          account. Switch back when Gemini&apos;s limit resets.
        </p>
      )}
      {saved && <p className="mt-2 text-xs text-emerald-700">Saved — the next AI request uses {provider === "gemini" ? "Gemini" : "Claude"}.</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
