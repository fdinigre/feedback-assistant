"use client";

import { useEffect } from "react";

/**
 * Lands a link from elsewhere — a "not yet reviewed", a "still a draft" — on the
 * part of this page it is about: a criterion's rubric or the report. The
 * browser's own jump happens before the page has laid out (the scans above load
 * late and push everything down), so it is made again once they have.
 *
 * The hash is read at each jump, not once on mount: arriving by a link click,
 * this page mounts before the router has put the hash in the address bar.
 */
export function useHashJump() {
  useEffect(() => {
    const jump = () => {
      const hash = window.location.hash;
      if (!/^#(criterion-[A-D]|report)$/.test(hash)) return;
      document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
    };
    const timers = [0, 150, 600].map((ms) => setTimeout(jump, ms));
    return () => timers.forEach(clearTimeout);
  }, []);
}
