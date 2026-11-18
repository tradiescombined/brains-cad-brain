import { asc, eq, and, count } from "drizzle-orm";
import { db, schema } from "@/db";
import { PageHeader } from "@/components/ui";
import { getLookups } from "@/lib/settings";
import { money } from "@/lib/format";
import { NewEstimateForm } from "./NewEstimateForm";

export const metadata = { title: "New estimate" };

export default async function NewEstimatePage({ searchParams }: { searchParams: Promise<{ template?: string; clientId?: string }> }) {
  const sp = await searchParams;
  const templates = await db
    .select({
      id: schema.estimates.id, name: schema.estimates.name, buildingType: schema.estimates.buildingType,
      quoteTotal: schema.estimates.quoteTotal, updatedAt: schema.estimates.updatedAt,
    })
    .from(schema.estimates)
    .where(and(eq(schema.estimates.isTemplate, true), eq(schema.estimates.archived, false)))
    .orderBy(asc(schema.estimates.name));
  const itemCounts = new Map(
    (
      await db
        .select({ estimateId: schema.estimateItems.estimateId, n: count() })
        .from(schema.estimateItems)
        .where(eq(schema.estimateItems.kind, "item"))
        .groupBy(schema.estimateItems.estimateId)
    ).map((r) => [r.estimateId, r.n]),
  );
  const clients = await db
    .select({
      id: schema.clients.id, name: schema.clients.name, email: schema.clients.email, mobile: schema.clients.mobile, phone: schema.clients.phone,
      address: schema.clients.address, cityTown: schema.clients.cityTown, state: schema.clients.state, postcode: schema.clients.postcode, source: schema.clients.source,
    })
    .from(schema.clients)
    .where(eq(schema.clients.archived, false))
    .orderBy(asc(schema.clients.name));
  const buildingTypes = (await getLookups("building_type")).map((l) => l.name);
  const initialTemplate = templates.some((t) => t.id === sp.template) ? sp.template! : "";

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="New estimate" subtitle="Start from scratch or reuse one of your templates." back={{ href: "/estimates", label: "Estimates" }} />
      <NewEstimateForm
        templates={templates.map((t) => ({ id: t.id, name: t.name, buildingType: t.buildingType, totalLabel: money(t.quoteTotal), itemCount: itemCounts.get(t.id) ?? 0 }))}
        clients={clients}
        buildingTypes={buildingTypes}
        initialTemplate={initialTemplate}
        initialClientId={clients.some((c) => c.id === sp.clientId) ? sp.clientId! : ""}
      />
    </div>
  );
}
