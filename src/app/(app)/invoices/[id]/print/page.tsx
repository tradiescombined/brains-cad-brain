import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getDefaultTaxRate, getSettings } from "@/lib/settings";
import { date, money } from "@/lib/format";
import { balanceDue, parseInvoiceLines } from "@/lib/money-docs";
import { Letterhead, PartyBlock, PrintSheet } from "../../../orders/_shared/Letterhead";
import { jobSite } from "../../../orders/_shared/data";

export const metadata = { title: "Print tax invoice" };

export default async function PrintInvoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, id));
  if (!inv) notFound();
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, inv.jobId));
  const [client] = job?.clientId ? await db.select().from(schema.clients).where(eq(schema.clients.id, job.clientId)) : [];
  const [tax, settings] = await Promise.all([getDefaultTaxRate(), getSettings()]);
  const lines = parseInvoiceLines(inv.lines);
  const due = balanceDue(inv.total, inv.amountPaid);
  return (
    <PrintSheet back={{ href: `/invoices/${inv.id}`, label: `Back to ${inv.number}` }}>
      {inv.status === "Void" && <div className="mb-4 rounded border-2 border-red-500 py-1 text-center text-lg font-bold uppercase tracking-widest text-red-600">Void</div>}
      <Letterhead
        docTitle="Tax invoice"
        docMeta={[
          ["Invoice no.", inv.number],
          ["Issue date", date(inv.issueDate)],
          ["Due date", date(inv.dueDate) || "On receipt"],
          ["Job", job?.number ?? "—"],
        ]}
      />
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <PartyBlock
          label="Bill to"
          lines={client ? [client.businessName || client.name, client.businessName ? client.name : null, client.address, [client.cityTown, client.state, client.postcode].filter(Boolean).join(" "), client.email, client.businessNumber ? `ABN ${client.businessNumber}` : null] : []}
        />
        <PartyBlock label="Project" lines={job ? [job.name, jobSite(job)] : []} />
      </div>
      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b-2 border-ink-300 text-left text-xs uppercase tracking-wide text-ink-500">
            <th className="py-2 pr-2">Description</th>
            <th className="py-2 pr-2 text-right">{tax.code}</th>
            <th className="py-2 text-right">Amount ex {tax.code}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-ink-100 align-top">
              <td className="py-1.5 pr-2">{l.description}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{l.taxable ? money(l.amount * tax.rate) : "—"}</td>
              <td className="py-1.5 text-right tabular-nums">{money(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex justify-end">
        <dl className="w-72 space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-ink-500">Subtotal</dt><dd className="tabular-nums">{money(inv.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-500">Total {tax.code}</dt><dd className="tabular-nums">{money(inv.taxTotal)}</dd></div>
          <div className="flex justify-between border-t border-ink-300 pt-1 font-semibold"><dt>Total inc {tax.code}</dt><dd className="tabular-nums">{money(inv.total)}</dd></div>
          {inv.amountPaid > 0 && <div className="flex justify-between text-ink-600"><dt>Less paid</dt><dd className="tabular-nums">−{money(inv.amountPaid)}</dd></div>}
          <div className="flex justify-between rounded bg-ink-100 px-2 py-1.5 text-base font-bold print:border print:border-ink-300"><dt>Amount due</dt><dd className="tabular-nums" data-testid="print-amount-due">{money(due)}</dd></div>
        </dl>
      </div>
      {inv.notes && <p className="mt-6 whitespace-pre-wrap text-sm text-ink-700">{inv.notes}</p>}
      <div className="mt-8 rounded-md border border-ink-200 p-4 text-sm">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">How to pay</div>
        {settings.bankDetails ? <p className="mt-1 whitespace-pre-wrap">{settings.bankDetails}</p> : <p className="mt-1 text-ink-500">Contact us for payment details.</p>}
        <p className="mt-2 text-ink-600">Please use <strong>{inv.number}</strong> as your payment reference.</p>
      </div>
    </PrintSheet>
  );
}
