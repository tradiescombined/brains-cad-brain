import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { Badge, Card, DescList, LinkButton, statusTone } from "@/components/ui";
import { ConfirmSubmit } from "../../../../orders/_shared/client";
import { getDefaultTaxRate, getLookups } from "@/lib/settings";
import { date, money } from "@/lib/format";
import { parseVariationLines, variationTotals } from "@/lib/money-docs";
import { VariationEditor, VariationStatusButtons } from "../VariationClient";
import { deleteVariation } from "../actions";

export const metadata = { title: "Variation" };

export default async function VariationPage({ params }: { params: Promise<{ id: string; vid: string }> }) {
  const { id, vid } = await params;
  const [v] = await db.select().from(schema.variations).where(and(eq(schema.variations.id, vid), eq(schema.variations.jobId, id)));
  if (!v) notFound();
  const [tax, uoms] = await Promise.all([getDefaultTaxRate(), getLookups("unit_measure")]);
  const lines = parseVariationLines(v.lines);
  const t = variationTotals(lines, v.markupPercent, tax.rate);
  const locked = v.status === "Approved";
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/jobs/${id}/variations`} className="text-xs font-medium text-ink-500 hover:text-brand-700">← Variations</Link>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            {v.number} · {v.title} <Badge tone={statusTone(v.status)}>{v.status}</Badge>
          </h2>
        </div>
        <LinkButton variant="secondary" href={`/jobs/${id}/variations/${v.id}/print`}>Print / PDF</LinkButton>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div className="min-w-0">
          {locked && (
            <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Approved {date(v.approvedAt)} — {money(v.total)} has been added to the contract value. Withdraw approval to edit.
            </p>
          )}
          <VariationEditor
            id={v.id}
            locked={locked}
            taxRate={tax.rate}
            taxLabel={`${tax.code} ${Math.round(tax.rate * 1000) / 10}%`}
            uoms={uoms.map((u) => u.name)}
            initial={{ title: v.title, description: v.description ?? "", markupPercent: v.markupPercent, lines }}
          />
        </div>
        <aside className="space-y-4">
          <Card title="Status">
            <VariationStatusButtons id={v.id} status={v.status} />
          </Card>
          <Card title="Saved totals">
            <DescList items={[["Cost", money(t.cost)], ["Markup", money(t.markup)], ["Tax", money(v.taxTotal)], ["Total", <strong key="t" className="tabular-nums">{money(v.total)}</strong>]]} />
          </Card>
          <Card title="Danger zone">
            <form action={deleteVariation}>
              <input type="hidden" name="id" value={v.id} />
              <ConfirmSubmit confirmText="Confirm delete" className="w-full">Delete variation</ConfirmSubmit>
            </form>
            {locked && <p className="mt-2 text-xs text-ink-500">Deleting an approved variation removes it from the contract value. Invoiced variations can&apos;t be deleted.</p>}
          </Card>
        </aside>
      </div>
    </div>
  );
}
