import Link from "next/link";

export type BreadcrumbItem = { label: string; href?: string };

/**
 * Shared breadcrumb trail — small, slate, "›" separators — used across every
 * deep page so there's one consistent "way up" pattern instead of ad-hoc back
 * links. The last item (current page) is rendered as plain text even if it
 * carries no href; pass one only for items that should link elsewhere.
 */
export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-slate-300">›</span>}
          {item.href ? (
            <Link href={item.href} className="hover:text-slate-900 hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-slate-700">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
