import Link from "next/link";
import { cx } from "@/lib/format";

/** "TC Quoting Estimate" logo (brain with glasses) + wordmark (sidebar, sign-in pages). `dark` = on the charcoal sidebar. */
export function Brand({ size = "sm", href = "/dashboard", dark = false }: { size?: "sm" | "lg"; href?: string; dark?: boolean }) {
  const lg = size === "lg";
  return (
    <Link href={href} className="flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo */}
      <img src="/logo.svg" alt="" className={cx("shrink-0", lg ? "size-10" : "size-8")} />
      <span className={cx("font-semibold leading-tight", dark ? "text-white" : "text-ink-900", lg ? "text-xl" : "text-sm")}>TC Quoting Estimate</span>
    </Link>
  );
}
