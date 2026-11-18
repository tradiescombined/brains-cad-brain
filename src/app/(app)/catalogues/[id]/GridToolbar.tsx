"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, Select } from "@/components/ui";
import { COST_TYPES } from "@/lib/catalogue-csv";
import { num } from "@/lib/format";

/** Search (debounced) + cost type filter, reflected in the URL so the server does the filtering. */
export function GridToolbar({ q, type, title, total }: { q: string; type: string; title: string; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [text, setText] = useState(q);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const push = (over: Record<string, string>) => {
    const u = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(over)) (v ? u.set(k, v) : u.delete(k));
    u.delete("page");
    const s = u.toString();
    start(() => router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false }));
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-semibold text-ink-900">{title}</h2>
        <span className="text-sm text-ink-500 tabular-nums">{num(total, 0)} {total === 1 ? "item" : "items"}</span>
        {pending && <span className="text-xs text-ink-400">Updating…</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => push({ q: v.trim() }), 300);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              clearTimeout(timer.current);
              push({ q: text.trim() });
            }
          }}
          placeholder="Search code or description…"
          aria-label="Search items"
          className="w-64"
        />
        <Select aria-label="Filter by cost type" value={type} onChange={(e) => push({ type: e.target.value })} options={[...COST_TYPES]} placeholder="All cost types" className="w-40" />
      </div>
    </div>
  );
}
