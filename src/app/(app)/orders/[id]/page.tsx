import { currentPermissions } from "@/lib/permissions";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { PageHeader, Badge, statusTone, Card, LinkButton, DescList } from "@/components/ui";
import { ConfirmSubmit } from "../_shared/client";
import { getLookups } from "@/lib/settings";
import { money, date, todayIso } from "@/lib/format";
import { canBillPo, parsePoLines, poNextStatuses } from "@/lib/money-docs";
import { getExpenseTaxRate, listSuppliers, supplierLabel } from "../_shared/data";
import { deleteOrder, setOrderStatus, undoBill } from "../actions";
import { PoEditor } from "./PoEditor";
import { RecordBill } from "./RecordBill";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [po] = await db.select({ number: schema.purchaseOrders.number }).from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, id));
  return { title: po ? `Order ${po.number}` : "Order" };
}

const STATUS_VERB: Record<string, string> = {
  Sent: "Mark as sent", Confirmed: "Mark confirmed", Delivered: "Mark delivered", Draft: "Back to draft", Cancelled: "Cancel order",
};

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const perm = await currentPermissions();
  const { id } = await params;
  const [po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, id));
  if (!po) notFound();
  const [job] = po.jobId ? await db.select().from(schema.jobs).where(eq(schema.jobs.id, po.jobId)) : [];
  const [suppliers, tax, uoms, bills] = await Promise.all([
    listSuppliers(),
    getExpenseTaxRate(),
    getLookups("unit_measure"),
    db.select().from(schema.actualCosts).where(eq(schema.actualCosts.purchaseOrderId, id)),
  ]);
  const supplier = suppliers.find((s) => s.id === po.supplierId);
  const locked = po.status === "Billed";
  const next = poNextStatuses(po.status);
  const returnTo = job ? `/jobs/${job.id}/orders` : "/orders";

  return (
    <div>
      <PageHeader
        back={job ? { href: `/jobs/${job.id}/orders`, label: `${job.number} · ${job.name}` } : { href: "/orders", label: "Purchase orders" }}
        title={<span className="flex items-center gap-2">Order {po.number} <Badge tone={statusTone(po.status)}>{po.status}</Badge></span>}
        subtitle={supplier ? supplierLabel(supplier) : "No supplier chosen yet"}
        actions={<LinkButton variant="secondary" href={`/orders/${po.id}/print`}>Print / PDF</LinkButton>}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          {locked && (
            <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Billed — this order is locked. Undo the bill to make changes.
            </p>
          )}
          <PoEditor
            id={po.id}
            locked={locked}
            taxRate={tax.rate}
            taxLabel={`${tax.code} ${Math.round(tax.rate * 1000) / 10}%`}
            suppliers={suppliers.map((s) => ({ value: s.id, label: supplierLabel(s) }))}
            uoms={uoms.map((u) => u.name)}
            initial={{
              supplierId: po.supplierId ?? "",
              orderDate: po.orderDate,
              deliveryDate: po.deliveryDate ?? "",
              deliveryAddress: po.deliveryAddress ?? "",
              deliveryInstructions: po.deliveryInstructions ?? "",
              lines: parsePoLines(po.lines),
            }}
          />
        </div>
        <aside className="space-y-4">
          <Card title="Status">
            <div className="space-y-2">
              {canBillPo(po.status) && <RecordBill id={po.id} number={po.number} subtotal={po.subtotal} tax={po.taxTotal} today={todayIso()} />}
              {next.map((s) => (
                <form key={s} action={setOrderStatus}>
                  <input type="hidden" name="id" value={po.id} />
                  <input type="hidden" name="status" value={s} />
                  <button className={s === "Cancelled" ? "w-full rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50" : "w-full rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-50"}>
                    {STATUS_VERB[s] ?? s}
                  </button>
                </form>
              ))}
              {locked && (
                <form action={undoBill}>
                  <input type="hidden" name="id" value={po.id} />
                  <button className="w-full rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-ink-50">Undo bill</button>
                </form>
              )}
            </div>
            <ol className="mt-4 flex flex-wrap gap-1 text-[11px]">
              {["Draft", "Sent", "Confirmed", "Delivered", "Billed"].map((s) => (
                <li key={s} className={s === po.status ? "rounded bg-brand-50 px-1.5 py-0.5 font-semibold text-brand-800" : "px-1.5 py-0.5 text-ink-400"}>{s}</li>
              ))}
            </ol>
          </Card>
          <Card title="Summary">
            <DescList
              items={[
                ["Job", job ? <Link href={`/jobs/${job.id}`} className="text-brand-700 hover:underline">{job.number} · {job.name}</Link> : null],
                ["Ordered", date(po.orderDate)],
                ["Delivery", date(po.deliveryDate)],
                ["Total inc tax", <span key="t" className="tabular-nums">{money(po.total)}</span>],
              ]}
            />
          </Card>
          {bills.length > 0 && (
            <Card title="Bill recorded">
              {bills.map((b) => (
                <div key={b.id} className="text-sm">
                  <div className="font-medium">{b.reference}</div>
                  <div className="text-ink-500">{date(b.date)} · {b.costType}</div>
                  <div className="mt-1 tabular-nums">{money(b.amount)} + {money(b.tax)} tax</div>
                </div>
              ))}
            </Card>
          )}
          {!locked && perm["orders.edit"] && (
            <Card title="Danger zone">
              <form action={deleteOrder}>
                <input type="hidden" name="id" value={po.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <ConfirmSubmit confirmText="Confirm delete" className="w-full">Delete order</ConfirmSubmit>
              </form>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
