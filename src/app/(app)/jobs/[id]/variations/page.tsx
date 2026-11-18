import Link from "next/link";
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { Badge, EmptyState, Stat, statusTone, Table, Td, Th } from "@/components/ui";
import { date, money } from "@/lib/format";
import { NewVariationButton } from "./VariationClient";

export const metadata = { title: "Variations" };

export default async function VariationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db.select().from(schema.variations).where(eq(schema.variations.jobId, id)).orderBy(desc(schema.variations.createdAt));
  const sum = (st: string[]) => rows.filter((r) => st.includes(r.status)).reduce((s, r) => s + r.total, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Approved" value={money(sum(["Approved"]))} sub={`${rows.filter((r) => r.status === "Approved").length} added to contract`} />
        <Stat label="Awaiting approval" value={money(sum(["Sent"]))} sub={`${rows.filter((r) => r.status === "Sent").length} sent`} />
        <Stat label="Draft" value={money(sum(["Draft"]))} />
        <Stat label="Rejected" value={money(sum(["Rejected"]))} />
      </div>
      <div className="flex justify-end"><NewVariationButton jobId={id} /></div>
      {rows.length ? (
        <Table>
          <thead>
            <tr>
              <Th>No.</Th>
              <Th>Title</Th>
              <Th>Status</Th>
              <Th>Approved</Th>
              <Th className="text-right">Cost</Th>
              <Th className="text-right">Total inc tax</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id} className="hover:bg-ink-50/60">
                <Td className="font-medium"><Link href={`/jobs/${id}/variations/${v.id}`} className="text-brand-700 hover:underline">{v.number}</Link></Td>
                <Td><Link href={`/jobs/${id}/variations/${v.id}`} className="hover:text-brand-700">{v.title}</Link></Td>
                <Td><Badge tone={statusTone(v.status)}>{v.status}</Badge></Td>
                <Td className="whitespace-nowrap">{date(v.approvedAt) || <span className="text-ink-400">—</span>}</Td>
                <Td className="text-right tabular-nums">{money(v.costTotal)}</Td>
                <Td className="text-right tabular-nums">{money(v.total)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="No variations yet" body="Record client-requested changes, price them with markup and tax, and approve them to update the contract value." action={<NewVariationButton jobId={id} />} />
      )}
    </div>
  );
}
