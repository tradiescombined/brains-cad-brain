import { notFound } from "next/navigation";
import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card } from "@/components/ui";
import { num } from "@/lib/format";
import { currentPermissions } from "@/lib/permissions";
import { SpecEditor } from "@/components/quote/SpecEditor";
import type { SpecTabItem } from "@/components/quote/SpecCostingParts";
import { fromRows } from "@/components/quote/spec-tree";
import { costingOutline } from "@/components/quote/spec-costings";
import { loadSpecItemDetails, loadSpecRows } from "@/components/quote/data";
import { saveTreeAsTemplate } from "@/app/(app)/settings/spec-library/actions";
import { saveSpecifications, saveSpecItemDetail, setItemInSpecification } from "./actions";

export const metadata = { title: "Specifications" };

export default async function SpecificationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [est] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, id));
  if (!est) notFound();
  const [rows, templates, items, details, perms] = await Promise.all([
    loadSpecRows(id),
    db
      .select({ id: schema.specificationTemplates.id, name: schema.specificationTemplates.name, content: schema.specificationTemplates.content })
      .from(schema.specificationTemplates)
      .orderBy(desc(schema.specificationTemplates.updatedAt)),
    db.select().from(schema.estimateItems).where(eq(schema.estimateItems.estimateId, id)).orderBy(asc(schema.estimateItems.sortOrder)),
    loadSpecItemDetails(id),
    currentPermissions(),
  ]);
  const outline = costingOutline(items);
  const rank = new Map(outline.order.map((x, i) => [x, i]));
  const tabItems: SpecTabItem[] = items
    .filter((i) => i.kind === "item")
    .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
    .map((i) => {
      const d = details.get(i.id);
      return {
        id: i.id,
        categoryId: outline.categoryOf.get(i.id) ?? null,
        description: i.description || "Untitled item",
        quantity: i.quantity,
        uom: i.uom,
        notes: i.notes,
        inSpec: i.showInSpecification,
        detail: d?.body ?? "",
        imageUrl: d?.hasImage ? `/estimates/${id}/specifications/image/${i.id}?v=${encodeURIComponent(d.updatedAt)}` : null,
      };
    });
  const tree = fromRows(rows);
  const linked = new Set(tree.map((n) => n.categoryItemId).filter(Boolean));
  // Spec items that will print under "Inclusions" because their category has no section yet.
  const unplaced = tabItems.filter((i) => i.inSpec && (!i.categoryId || !linked.has(i.categoryId)));
  const flagged = tabItems.filter((i) => i.inSpec).length;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <SpecEditor
          initial={tree}
          intro={est.specificationIntro ?? ""}
          saveAction={saveSpecifications.bind(null, id)}
          templates={templates}
          presetsLabel="Presets"
          saveAsTemplateAction={saveTreeAsTemplate}
          emptyHint="Use “Sync with costings” to add a section for each costing category with specification items, or add your own sections."
          costing={{
            estimateId: id,
            canEdit: perms["estimates.edit"],
            categories: outline.categories,
            items: tabItems,
            setInSpec: setItemInSpecification.bind(null, id),
            saveDetail: saveSpecItemDetail.bind(null, id),
          }}
        />
      </div>
      <aside className="space-y-4">
        <Card title="Specification items">
          <p className="text-sm text-ink-600">
            {flagged} costing item{flagged === 1 ? "" : "s"} marked “Show in specification”. Items appear under their costing
            category’s section, where you can add detail and an image.
          </p>
          {unplaced.length > 0 ? (
            <>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-ink-500">Not in a section yet</p>
              <ul className="mt-1 space-y-2 text-sm" data-testid="spec-inclusions">
                {unplaced.map((i) => (
                  <li key={i.id} className="border-b border-ink-100 pb-2 last:border-0 last:pb-0">
                    <div className="font-medium text-ink-800">{i.description}</div>
                    <div className="text-xs text-ink-500">
                      {num(i.quantity, 3)} {i.uom}
                      {i.notes ? ` · ${i.notes}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink-400">Printed under “Inclusions” until you sync with costings.</p>
            </>
          ) : flagged === 0 ? (
            <p className="mt-2 text-sm text-ink-500">
              Turn on “Show in specification” for items in{" "}
              <Link href={`/estimates/${id}/costings`} className="font-medium text-brand-700 hover:underline">Costings</Link>.
            </p>
          ) : null}
        </Card>
        <Card title="Presets">
          <p className="text-sm text-ink-600">
            {templates.length} saved preset{templates.length === 1 ? "" : "s"} in your specification library.{" "}
            <Link href="/settings/spec-library" className="font-medium text-brand-700 hover:underline">Manage presets</Link>
          </p>
        </Card>
      </aside>
    </div>
  );
}
