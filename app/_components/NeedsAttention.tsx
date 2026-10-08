import Link from "next/link";
import type { NeedsAttentionItem } from "@/lib/dashboard/data";

export function NeedsAttention({ items }: { items: NeedsAttentionItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className="flex items-baseline justify-between gap-4 rounded-lg border border-amber-200 bg-white px-6 py-5 hover:border-amber-300"
        >
          <span className="text-[17px] font-medium leading-snug">{item.text}</span>
          <span className="shrink-0 text-slate-400">→</span>
        </Link>
      ))}
    </section>
  );
}
