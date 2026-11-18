/** Sortable table header link (server component). */
import Link from "next/link";
import { Th } from "@/components/ui";
import { cx } from "@/lib/format";
import type { SortDir } from "./list";

export function SortTh({ label, k, sort, dir, href, className }: { label: string; k: string; sort: string; dir: SortDir; href: (k: string, dir: SortDir) => string; className?: string }) {
  const active = sort === k;
  const next: SortDir = active && dir === "asc" ? "desc" : "asc";
  return (
    <Th className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={href(k, next)} className={cx("inline-flex items-center gap-1 hover:text-ink-800", active && "text-ink-800")}>
        {label}
        <span aria-hidden className={cx("text-[10px]", !active && "opacity-0")}>{dir === "asc" || !active ? "▲" : "▼"}</span>
      </Link>
    </Th>
  );
}
