import Link from "next/link";
import { cx } from "@/lib/format";

/** "Brains Cad Brain" wordmark (sidebar, sign-in pages). */
export function Brand({ size = "sm", href = "/dashboard" }: { size?: "sm" | "lg"; href?: string }) {
  const lg = size === "lg";
  return (
    <Link href={href} className="flex items-center gap-2">
      <span
        className={cx(
          "grid place-items-center rounded-md bg-brand-600 font-bold text-white",
          lg ? "size-10 text-lg" : "size-7 text-sm",
        )}
      >
        B
      </span>
      <span className={cx("font-semibold leading-tight text-ink-900", lg ? "text-xl" : "text-sm")}>Brains Cad Brain</span>
    </Link>
  );
}
