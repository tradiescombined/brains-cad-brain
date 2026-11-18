"use client";
import { useEffect } from "react";

/** Opens the browser print dialog once the page has rendered (skipped with ?noprint=1). */
export function AutoPrint() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("noprint")) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <button type="button" onClick={() => window.print()} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
      Print / save as PDF
    </button>
  );
}
