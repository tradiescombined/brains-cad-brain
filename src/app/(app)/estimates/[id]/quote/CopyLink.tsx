"use client";
import { useState } from "react";

/** Read-only URL field with a copy button (falls back to selecting the text). */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState<"idle" | "copied" | "select">("idle");
  const copy = async (input: HTMLInputElement | null) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("copied");
    } catch {
      input?.select();
      setCopied("select");
    }
    setTimeout(() => setCopied("idle"), 2500);
  };
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <input
        readOnly value={url} aria-label="Client quote link" data-testid="share-url" onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1.5 font-mono text-xs text-ink-700"
      />
      <button
        type="button"
        onClick={(e) => copy(e.currentTarget.previousElementSibling as HTMLInputElement | null)}
        className="whitespace-nowrap rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-ink-50"
      >
        {copied === "copied" ? "Copied" : copied === "select" ? "Press ⌘C" : "Copy link"}
      </button>
    </div>
  );
}
