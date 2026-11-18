import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getDefaultTaxRate } from "@/lib/settings";
import { date, money, num } from "@/lib/format";
import { parseVariationLines, poLineTotal, variationTotals } from "@/lib/money-docs";
import { Letterhead, PartyBlock, PrintSheet } from "../../../../../orders/_shared/Letterhead";
import { jobSite } from "../../../../../orders/_shared/data";

export const metadata = { title: "Print variation" };

export default async function PrintVariation({ params }: { params: Promise<{ id: string; vid: string }> }) {
  const { id, vid } = await params;
  const [v] = await db.select().from(schema.variations).where(and(eq(schema.variations.id, vid), eq(schema.variations.jobId, id)));
  if (!v) notFound();
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  const [client] = job?.clientId ? await db.select().from(schema.clients).where(eq(schema.clients.id, job.clientId)) : [];
  const tax = await getDefaultTaxRate();
  const lines = parseVariationLines(v.lines);
  const t = variationTotals(lines, v.markupPercent, tax.rate);
  const factor = 1 + v.markupPercent / 100;
  return (
    <PrintSheet back={{ href: `/jobs/${id}/variations/${v.id}`, label: `Back to ${v.number}` }}>
      <Letterhead docTitle="Variation" docMeta={[["Variation no.", v.number], ["Date", date(v.createdAt)], ["Status", v.status], ["Job", job?.number ?? "—"]]} />
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <PartyBlock label="Client" lines={client ? [client.businessName || client.name, client.address, [client.cityTown, client.state, client.postcode].filter(Boolean).join(" "), client.email] : []} />
        <PartyBlock label="Project" lines={job ? [job.name, jobSite(job)] : []} />
      </div>
      <h2 className="mt-6 text-lg font-semibold">{v.title}</h2>
      {v.description && <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{v.description}</p>}
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b-2 border-ink-300 text-left text-xs uppercase tracking-wide text-ink-500">
            <th className="py-2 pr-2">Description</th>
            <th className="py-2 pr-2 text-right">Qty</th>
            <th className="py-2 pr-2">UOM</th>
            <th className="py-2 pr-2 text-right">Rate</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-ink-100">
              <td className="py-1.5 pr-2">{l.description}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{num(l.quantity, 3)}</td>
              <td className="py-1.5 pr-2">{l.uom}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{money(l.unitCost * factor)}</td>
              <td className="py-1.5 text-right tabular-nums">{money(poLineTotal(l) * factor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex justify-end">
        <dl className="w-64 space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-ink-500">Subtotal ex tax</dt><dd className="tabular-nums">{money(t.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-500">{tax.code}</dt><dd className="tabular-nums">{money(t.tax)}</dd></div>
          <div className="flex justify-between border-t-2 border-ink-300 pt-1 text-base font-semibold"><dt>Variation total</dt><dd className="tabular-nums">{money(t.total)}</dd></div>
        </dl>
      </div>
      <div className="mt-6 text-sm text-ink-700">
        This variation {t.total >= 0 ? "adds" : "reduces"} the contract price by <strong>{money(Math.abs(t.total))}</strong> including tax once approved.
      </div>
      <div className="mt-12 grid gap-10 sm:grid-cols-2">
        {["Client approval", "Builder"].map((w) => (
          <div key={w}>
            <div className="h-12 border-b border-ink-400" />
            <div className="mt-1 flex justify-between text-xs text-ink-500"><span>{w} — signature</span><span>Date</span></div>
          </div>
        ))}
      </div>
    </PrintSheet>
  );
}
