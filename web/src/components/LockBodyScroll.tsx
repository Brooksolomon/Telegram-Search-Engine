"use client";

import { useEffect } from "react";

/**
 * Prevents the page body from scrolling while mounted. Used on the full-window
 * graph page so the nav/banner/header don't scroll away behind the fixed canvas.
 */
export function LockBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Measure the page chrome (banner + nav) so the fixed graph canvas can sit
    // exactly below it via --chrome-h. Re-measure on resize / banner dismiss.
    const measure = () => {
      const header = document.querySelector("header");
      const headerBottom = header
        ? header.getBoundingClientRect().bottom + window.scrollY
        : 57;
      document.documentElement.style.setProperty(
        "--chrome-h",
        `${Math.round(headerBottom)}px`
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener("resize", measure);

    return () => {
      document.body.style.overflow = prev;
      document.documentElement.style.removeProperty("--chrome-h");
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return null;
}
