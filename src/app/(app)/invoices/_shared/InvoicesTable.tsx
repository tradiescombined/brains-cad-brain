import Link from "next/link";
import { Badge, statusTone, Table, Td, Th } from "@/components/ui";
import { date, money } from "@/lib/format";
import { balanceDue, daysOverdue, isOverdue } from "@/lib/money-docs";

export type InvoiceRow = {
  id: string; number: string; kind: string; status: string; issueDate: string; dueDate: string | null;
  total: number; amountPaid: number; jobId: string; jobNumber: string | null; jobName: string | null; clientName: string | null;
};

export function OverdueBadge({ inv, today }: { inv: { status: string; total: number; amountPaid: number; dueDate: string | null }; today: string }) {
  if (!isOverdue(inv, today)) return null;
  return <Badge tone="amber">Overdue {daysOverdue(inv.dueDate, today)}d</Badge>;
}

export function InvoicesTable({ rows, today, showJob = true }: { rows: InvoiceRow[]; today: string; showJob?: boolean }) {
  const live = rows.filter((r) => r.status !== "Void");
  return (
    <Table>
      <thead>
        <tr>
          <Th>Invoice</Th>
          <Th>Type</Th>
          {showJob && <Th>Job</Th>}
          {showJob && <Th>Client</Th>}
          <Th>Status</Th>
          <Th>Issued</Th>
          <Th>Due</Th>
          <Th className="text-right">Total</Th>
          <Th className="text-right">Paid</Th>
          <Th className="text-right">Balance</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className={r.status === "Void" ? "text-ink-400 line-through decoration-ink-300" : "hover:bg-ink-50/60"}>
            <Td className="font-medium"><Link href={`/invoices/${r.id}`} className="text-brand-700 hover:underline">{r.number}</Link></Td>
            <Td className="whitespace-nowrap">{r.kind}</Td>
            {showJob && <Td className="max-w-48 truncate"><Link href={`/jobs/${r.jobId}/invoices`} className="hover:text-brand-700">{r.jobNumber} · {r.jobName}</Link></Td>}
            {showJob && <Td className="max-w-40 truncate">{r.clientName ?? <span className="text-ink-400">—</span>}</Td>}
            <Td className="whitespace-nowrap">
              <span className="flex items-center gap-1"><Badge tone={statusTone(r.status)}>{r.status}</Badge><OverdueBadge inv={r} today={today} /></span>
            </Td>
            <Td className="whitespace-nowrap">{date(r.issueDate)}</Td>
            <Td className="whitespace-nowrap">{date(r.dueDate) || "—"}</Td>
            <Td className="text-right tabular-nums">{money(r.total)}</Td>
            <Td className="text-right tabular-nums">{money(r.amountPaid)}</Td>
            <Td className="text-right font-medium tabular-nums">{r.status === "Void" ? "—" : money(balanceDue(r.total, r.amountPaid))}</Td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <Td colSpan={showJob ? 7 : 5} className="border-b-0 text-right text-xs font-semibold uppercase tracking-wide text-ink-500">Totals (excl. void)</Td>
          <Td className="border-b-0 text-right font-semibold tabular-nums">{money(live.reduce((s, r) => s + r.total, 0))}</Td>
          <Td className="border-b-0 text-right font-semibold tabular-nums">{money(live.reduce((s, r) => s + r.amountPaid, 0))}</Td>
          <Td className="border-b-0 text-right font-semibold tabular-nums">{money(live.reduce((s, r) => s + balanceDue(r.total, r.amountPaid), 0))}</Td>
        </tr>
      </tfoot>
    </Table>
  );
}
