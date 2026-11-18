import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { Badge, Card, DescList, LinkButton, PageHeader, statusTone } from "@/components/ui";
import { ConfirmSubmit } from "../../orders/_shared/client";
import { getDefaultTaxRate } from "@/lib/settings";
import { date, money, todayIso } from "@/lib/format";
import { balanceDue, parseInvoiceLines } from "@/lib/money-docs";
import { deleteInvoice, deletePayment, setInvoiceStatus } from "../actions";
import { InvoiceEditor, PaymentForm } from "../_shared/InvoiceClient";
import { OverdueBadge } from "../_shared/InvoicesTable";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [i] = await db.select({ number: schema.invoices.number }).from(schema.invoices).where(eq(schema.invoices.id, id));
  return { title: i ? `Invoice ${i.number}` : "Invoice" };
}

function StatusBtn({ id, action, children, tone = "secondary" }: { id: string; action: string; children: React.ReactNode; tone?: "primary" | "secondary" | "danger" }) {
  const cls = {
    primary: "w-full rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700",
    secondary: "w-full rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-ink-50",
    danger: "w-full rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50",
  }[tone];
  return (
    <form action={setInvoiceStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      <button className={cls}>{children}</button>
    </form>
  );
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, id));
  if (!inv) notFound();
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, inv.jobId));
  const [client] = job?.clientId ? await db.select().from(schema.clients).where(eq(schema.clients.id, job.clientId)) : [];
  const [tax, pays] = await Promise.all([
    getDefaultTaxRate(),
    db.select().from(schema.payments).where(eq(schema.payments.invoiceId, id)).orderBy(desc(schema.payments.date)),
  ]);
  const today = todayIso();
  const balance = balanceDue(inv.total, inv.amountPaid);
  const isVoid = inv.status === "Void";
  return (
    <div>
      <PageHeader
        back={job ? { href: `/jobs/${job.id}/invoices`, label: `${job.number} · ${job.name}` } : { href: "/invoices", label: "Invoices" }}
        title={<span className="flex flex-wrap items-center gap-2">Invoice {inv.number} <Badge tone={statusTone(inv.status)}>{inv.status}</Badge><OverdueBadge inv={inv} today={today} /></span>}
        subtitle={`${inv.kind}${client ? ` · ${client.businessName || client.name}` : ""}${inv.claimPercent != null ? ` · ${inv.claimPercent}% ${inv.kind === "Deposit" ? "deposit" : "complete"}` : ""}`}
        actions={<LinkButton variant="secondary" href={`/invoices/${inv.id}/print`}>Print / PDF</LinkButton>}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          {isVoid && <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">This invoice is void and excluded from claims and receivables.</p>}
          <InvoiceEditor
            id={inv.id}
            locked={isVoid}
            taxRate={tax.rate}
            taxLabel={`${tax.code} ${Math.round(tax.rate * 1000) / 10}%`}
            initial={{ issueDate: inv.issueDate, dueDate: inv.dueDate ?? "", notes: inv.notes ?? "", lines: parseInvoiceLines(inv.lines), amountPaid: inv.amountPaid }}
          />
        </div>
        <aside className="space-y-4">
          <Card title="Balance">
            <DescList items={[["Total", money(inv.total)], ["Paid", money(inv.amountPaid)], ["Balance due", <strong key="b" className="tabular-nums" data-testid="inv-balance">{money(balance)}</strong>], ["Due", date(inv.dueDate)]]} />
          </Card>
          <Card title="Status">
            <div className="space-y-2">
              {inv.status === "Draft" && <StatusBtn id={inv.id} action="send" tone="primary">Mark as sent</StatusBtn>}
              {inv.status === "Sent" && inv.amountPaid === 0 && <StatusBtn id={inv.id} action="draft">Back to draft</StatusBtn>}
              {isVoid ? <StatusBtn id={inv.id} action="unvoid">Restore invoice</StatusBtn> : <StatusBtn id={inv.id} action="void" tone="danger">Void invoice</StatusBtn>}
            </div>
          </Card>
          {!isVoid && balance > 0.004 && (
            <Card title="Record payment">
              <PaymentForm invoiceId={inv.id} balance={balance} today={today} />
            </Card>
          )}
          <Card title={`Payments (${pays.length})`}>
            {pays.length ? (
              <ul className="divide-y divide-ink-100 text-sm" data-testid="payments">
                {pays.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                    <div>
                      <div className="font-medium tabular-nums">{money(p.amount)}</div>
                      <div className="text-xs text-ink-500">{date(p.date)} · {p.method}{p.reference ? ` · ${p.reference}` : ""}</div>
                    </div>
                    <form action={deletePayment}>
                      <input type="hidden" name="id" value={p.id} />
                      <ConfirmSubmit confirmText="Remove?" className="!px-2 !py-1 !text-xs">Remove</ConfirmSubmit>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500">No payments yet.</p>
            )}
          </Card>
          <Card title="Danger zone">
            <form action={deleteInvoice}>
              <input type="hidden" name="id" value={inv.id} />
              <ConfirmSubmit confirmText="Confirm delete" className="w-full">Delete invoice</ConfirmSubmit>
            </form>
            <p className="mt-2 text-xs text-ink-500">Prefer voiding sent invoices so the number stays in your records. {job && <Link href={`/jobs/${job.id}/invoices`} className="text-brand-700">Job invoices</Link>}</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
