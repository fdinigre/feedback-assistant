"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string };

/**
 * The sidebar links. Client-side only so the current section can be marked —
 * with seven destinations and several of them nested, "where am I" is worth a
 * client boundary this small.
 */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        // /students must not light up on /students/conferences, which has its
        // own entry; everything else matches on its prefix.
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href ||
              (pathname.startsWith(`${item.href}/`) &&
                !items.some(
                  (other) =>
                    other !== item &&
                    pathname.startsWith(other.href) &&
                    other.href.length > item.href.length
                ));

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "block rounded-md bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
                  : "block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200/60 hover:text-slate-900"
              }
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
