import { Badge } from "@/components/ui";
import { date } from "@/lib/format";
import { insuranceLabel, insuranceStatus } from "./fields";

export function InsuranceBadge({ expiry, today, showDate = true }: { expiry: string | null; today: string; showDate?: boolean }) {
  const s = insuranceStatus(expiry, today);
  if (s.state === "none") return <span className="text-ink-300">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" data-insurance={s.state}>
      {showDate && <span className="whitespace-nowrap">{date(expiry)}</span>}
      {s.state !== "ok" && <Badge tone={s.state === "expired" ? "red" : "amber"}>{insuranceLabel(s)}</Badge>}
    </span>
  );
}
