import Link from "next/link";
import { getDefaultTaxRate } from "@/lib/settings";
import { todayIso } from "@/lib/format";
import { INVOICE_KINDS, type InvoiceKind } from "@/lib/money-docs";
import { getJobContract } from "../../../../orders/_shared/data";
import { NewInvoiceForm } from "../../../../invoices/_shared/InvoiceClient";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kind?: string }> }) {
  const { id } = await params;
  const { kind } = await searchParams;
  const [c, tax] = await Promise.all([getJobContract(id), getDefaultTaxRate()]);
  if (!c) return null;
  const initialKind: InvoiceKind = (INVOICE_KINDS as readonly string[]).includes(kind ?? "") ? (kind as InvoiceKind) : c.invoices.some((i) => i.status !== "Void") ? "Progress claim" : "Deposit";
  return (
    <div>
      <Link href={`/jobs/${id}/invoices`} className="text-xs font-medium text-ink-500 hover:text-brand-700">← Invoices</Link>
      <h2 className="mb-4 text-lg font-semibold">New invoice</h2>
      <NewInvoiceForm
        jobId={id}
        today={todayIso()}
        taxRate={tax.rate}
        base={c.summary.base}
        contract={c.summary.contract}
        contractClaims={c.summary.contractClaims}
        remaining={c.summary.remaining}
        variations={c.variations.filter((v) => v.status === "Approved" && !c.invoicedVariationIds.has(v.id)).map((v) => ({ id: v.id, number: v.number, title: v.title, total: v.total }))}
        initialKind={initialKind}
      />
    </div>
  );
}
