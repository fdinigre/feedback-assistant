"use client";

import { useState } from "react";

/**
 * Folds the sidebar to a thin rail and lets the page take the width — a scanned
 * paper is the one thing here that is better wider. The choice is kept in a
 * cookie so the layout renders the right width on the first paint, rather than
 * opening wide and snapping shut once this has loaded.
 */
export function SidebarToggle({ initialCollapsed }: { initialCollapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    // The layout reads this attribute for every width that changes, so flipping
    // it here is the whole switch; the cookie is what the next page load reads.
    document.body.dataset.nav = next ? "collapsed" : "open";
    document.cookie = `nav=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Show the sidebar" : "Hide the sidebar"}
      title={collapsed ? "Show the sidebar" : "Hide the sidebar"}
      className="shrink-0 rounded-md px-2 py-1 text-lg leading-none text-slate-500 hover:bg-slate-200/60 hover:text-slate-900"
    >
      {collapsed ? "»" : "«"}
    </button>
  );
}
