import Link from "next/link";
import { Badge, statusTone, Table, Th, Td } from "@/components/ui";
import { money, date } from "@/lib/format";
import { parsePoLines } from "@/lib/money-docs";

export type OrderRow = {
  id: string; number: string; status: string; orderDate: string; deliveryDate: string | null; total: number; lines: string;
  jobId: string | null; jobNumber: string | null; jobName: string | null; supplierName: string | null;
};

export function OrdersTable({ rows, showJob = true }: { rows: OrderRow[]; showJob?: boolean }) {
  const total = rows.filter((r) => r.status !== "Cancelled").reduce((s, r) => s + r.total, 0);
  return (
    <Table>
      <thead>
        <tr>
          <Th>Order</Th>
          {showJob && <Th>Job</Th>}
          <Th>Supplier</Th>
          <Th>Status</Th>
          <Th>Ordered</Th>
          <Th>Delivery</Th>
          <Th className="text-right">Lines</Th>
          <Th className="text-right">Total inc tax</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-ink-50/60">
            <Td className="font-medium"><Link href={`/orders/${r.id}`} className="text-brand-700 hover:underline">{r.number}</Link></Td>
            {showJob && (
              <Td className="max-w-56 truncate">
                {r.jobId ? <Link href={`/jobs/${r.jobId}/orders`} className="hover:text-brand-700">{r.jobNumber} · {r.jobName}</Link> : <span className="text-ink-400">—</span>}
              </Td>
            )}
            <Td className="max-w-56 truncate">{r.supplierName ?? <span className="text-ink-400">Not set</span>}</Td>
            <Td><Badge tone={statusTone(r.status)}>{r.status}</Badge></Td>
            <Td className="whitespace-nowrap">{date(r.orderDate)}</Td>
            <Td className="whitespace-nowrap">{date(r.deliveryDate) || <span className="text-ink-400">—</span>}</Td>
            <Td className="text-right tabular-nums">{parsePoLines(r.lines).length}</Td>
            <Td className="text-right tabular-nums">{money(r.total)}</Td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <Td colSpan={showJob ? 7 : 6} className="border-b-0 text-right text-xs font-semibold uppercase tracking-wide text-ink-500">Total (excl. cancelled)</Td>
          <Td className="border-b-0 text-right font-semibold tabular-nums">{money(total)}</Td>
        </tr>
      </tfoot>
    </Table>
  );
}
