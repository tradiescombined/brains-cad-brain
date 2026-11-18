import Link from "next/link";
import { and, asc, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { ConfirmSubmit } from "../_components/ConfirmSubmit";
import { getLookups } from "@/lib/settings";
import { date, money } from "@/lib/format";
import { deleteEstimate } from "../actions";
import { NewTemplateForm, RenameTemplate } from "./TemplateForms";

export const metadata = { title: "Estimate templates" };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const sp = await searchParams;
  const templates = await db
    .select()
    .from(schema.estimates)
    .where(and(eq(schema.estimates.isTemplate, true)))
    .orderBy(asc(schema.estimates.name));
  const counts = new Map(
    (
      await db
        .select({ estimateId: schema.estimateItems.estimateId, n: count() })
        .from(schema.estimateItems)
        .where(eq(schema.estimateItems.kind, "item"))
        .groupBy(schema.estimateItems.estimateId)
    ).map((r) => [r.estimateId, r.n]),
  );
  const buildingTypes = (await getLookups("building_type")).map((l) => l.name);
  const saved = templates.find((t) => t.id === sp.saved);

  return (
    <div>
      <PageHeader
        title="Estimate templates"
        subtitle="Reusable starting points: costings, specifications, quote settings and plans."
        back={{ href: "/estimates", label: "Estimates" }}
        actions={<NewTemplateForm buildingTypes={buildingTypes} />}
      />
      {saved && (
        <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          Saved “{saved.name}” as a template. <Link href={`/estimates/${saved.id}`} className="font-medium underline">Open it</Link>
        </div>
      )}
      {templates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          body="Create a blank template and build its costings, or open any estimate and choose More → Save as template."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name &amp; building type</Th>
              <Th className="hidden text-right sm:table-cell">Items</Th>
              <Th className="hidden text-right md:table-cell">Total</Th>
              <Th className="hidden lg:table-cell">Updated</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} data-testid="template-row" className="align-top">
                <Td>
                  <RenameTemplate id={t.id} name={t.name} buildingType={t.buildingType ?? ""} buildingTypes={buildingTypes} />
                  {t.archived && <span className="mt-1 inline-block text-xs text-amber-700">Archived</span>}
                </Td>
                <Td className="hidden text-right tabular-nums sm:table-cell">{counts.get(t.id) ?? 0}</Td>
                <Td className="hidden text-right tabular-nums md:table-cell">{money(t.quoteTotal)}</Td>
                <Td className="hidden whitespace-nowrap text-ink-500 lg:table-cell">{date(t.updatedAt)}</Td>
                <Td className="text-right">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <LinkButton variant="secondary" href={`/estimates/${t.id}`}>Open</LinkButton>
                    <LinkButton variant="secondary" href={`/estimates/new?template=${t.id}`}>Use</LinkButton>
                    <form action={deleteEstimate}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="redirectTo" value="/estimates/templates" />
                      <ConfirmSubmit confirmText="Confirm delete" pendingText="Deleting…">Delete</ConfirmSubmit>
                    </form>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
