import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { money, date, num } from "@/lib/format";
import { parsePoLines, poLineTotal } from "@/lib/money-docs";
import { getExpenseTaxRate } from "../../_shared/data";
import { Letterhead, PartyBlock, PrintSheet } from "../../_shared/Letterhead";

export const metadata = { title: "Print purchase order" };

export default async function PrintOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, id));
  if (!po) notFound();
  const [job] = po.jobId ? await db.select().from(schema.jobs).where(eq(schema.jobs.id, po.jobId)) : [];
  const [sup] = po.supplierId ? await db.select().from(schema.contacts).where(eq(schema.contacts.id, po.supplierId)) : [];
  const tax = await getExpenseTaxRate();
  const lines = parsePoLines(po.lines);
  return (
    <PrintSheet back={{ href: `/orders/${po.id}`, label: `Back to ${po.number}` }}>
      <Letterhead
        docTitle="Purchase order"
        docMeta={[
          ["Order no.", po.number],
          ["Order date", date(po.orderDate)],
          ["Required by", date(po.deliveryDate) || "—"],
          ["Job", job ? job.number : "—"],
        ]}
      />
      <div className="mt-6 grid gap-6 sm:grid-cols-3">
        <PartyBlock
          label="Supplier"
          lines={sup ? [sup.businessName || sup.name, sup.businessName ? `Attn: ${sup.name}` : null, sup.address, [sup.cityTown, sup.state, sup.postcode].filter(Boolean).join(" "), sup.email, sup.phone || sup.mobile, sup.accountNumber ? `Account ${sup.accountNumber}` : null] : []}
        />
        <PartyBlock label="Deliver to" lines={[po.deliveryAddress]} />
        <PartyBlock label="Project" lines={job ? [job.name, job.number] : []} />
      </div>
      {po.deliveryInstructions && (
        <div className="mt-5 rounded-md bg-ink-50 p-3 text-sm print:border print:border-ink-200">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Delivery instructions</div>
          <p className="mt-1 whitespace-pre-wrap">{po.deliveryInstructions}</p>
        </div>
      )}
      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b-2 border-ink-300 text-left text-xs uppercase tracking-wide text-ink-500">
            <th className="py-2 pr-2">Code</th>
            <th className="py-2 pr-2">Description</th>
            <th className="py-2 pr-2 text-right">Qty</th>
            <th className="py-2 pr-2">UOM</th>
            <th className="py-2 pr-2 text-right">Unit cost</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-ink-100 align-top">
              <td className="py-1.5 pr-2 text-ink-500">{l.itemCode}</td>
              <td className="py-1.5 pr-2">{l.description}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{num(l.quantity, 3)}</td>
              <td className="py-1.5 pr-2">{l.uom}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{money(l.unitCost)}</td>
              <td className="py-1.5 text-right tabular-nums">{money(poLineTotal(l))}</td>
            </tr>
          ))}
          {!lines.length && <tr><td colSpan={6} className="py-6 text-center text-ink-400">No lines on this order.</td></tr>}
        </tbody>
      </table>
      <div className="mt-4 flex justify-end">
        <dl className="w-64 space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-ink-500">Subtotal</dt><dd className="tabular-nums">{money(po.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-500">{tax.code}</dt><dd className="tabular-nums">{money(po.taxTotal)}</dd></div>
          <div className="flex justify-between border-t-2 border-ink-300 pt-1 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{money(po.total)}</dd></div>
        </dl>
      </div>
      <p className="mt-10 text-xs text-ink-500">Please quote order number {po.number} on all delivery dockets and invoices. Contact us before substituting products or changing delivery times.</p>
    </PrintSheet>
  );
}
