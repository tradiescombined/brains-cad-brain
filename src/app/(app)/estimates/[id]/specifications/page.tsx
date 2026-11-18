import { notFound } from "next/navigation";
import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card } from "@/components/ui";
import { num } from "@/lib/format";
import { SpecEditor } from "@/components/quote/SpecEditor";
import { fromRows } from "@/components/quote/spec-tree";
import { loadSpecRows } from "@/components/quote/data";
import { saveTreeAsTemplate } from "@/app/(app)/settings/spec-library/actions";
import { saveSpecifications } from "./actions";

export const metadata = { title: "Specifications" };

export default async function SpecificationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [est] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, id));
  if (!est) notFound();
  const rows = await loadSpecRows(id);
  const templates = await db
    .select({ id: schema.specificationTemplates.id, name: schema.specificationTemplates.name, content: schema.specificationTemplates.content })
    .from(schema.specificationTemplates)
    .orderBy(desc(schema.specificationTemplates.updatedAt));
  const items = await db
    .select()
    .from(schema.estimateItems)
    .where(eq(schema.estimateItems.estimateId, id))
    .orderBy(asc(schema.estimateItems.sortOrder));
  const included = items.filter((i) => i.kind === "item" && i.showInSpecification);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <SpecEditor
          initial={fromRows(rows)}
          intro={est.specificationIntro ?? ""}
          saveAction={saveSpecifications.bind(null, id)}
          templates={templates}
          saveAsTemplateAction={saveTreeAsTemplate}
        />
      </div>
      <aside className="space-y-4">
        <Card title="Inclusions from costings">
          {included.length === 0 ? (
            <p className="text-sm text-ink-500">
              No costing items are flagged to show in the specification. Turn on “Show in specification” for an item in{" "}
              <Link href={`/estimates/${id}/costings`} className="font-medium text-brand-700 hover:underline">Costings</Link>.
            </p>
          ) : (
            <ul className="space-y-2 text-sm" data-testid="spec-inclusions">
              {included.map((i) => (
                <li key={i.id} className="border-b border-ink-100 pb-2 last:border-0 last:pb-0">
                  <div className="font-medium text-ink-800">{i.description || "Untitled item"}</div>
                  <div className="text-xs text-ink-500">
                    {num(i.quantity, 3)} {i.uom}
                    {i.notes ? ` · ${i.notes}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-ink-400">Printed under “Inclusions” after your sections. Edit these in Costings.</p>
        </Card>
        <Card title="Library">
          <p className="text-sm text-ink-600">
            {templates.length} saved template{templates.length === 1 ? "" : "s"}.{" "}
            <Link href="/settings/spec-library" className="font-medium text-brand-700 hover:underline">Manage library</Link>
          </p>
        </Card>
      </aside>
    </div>
  );
}
