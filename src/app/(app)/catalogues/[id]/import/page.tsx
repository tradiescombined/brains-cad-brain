import { requirePermission } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { CatalogueHeader } from "../CatalogueHeader";
import { ImportWizard } from "./ImportWizard";
import { categoryCounts, getCatalogue } from "../../server";

export const metadata = { title: "Import items · Catalogues" };

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("catalogues.edit");
  const { id } = await params;
  const c = await getCatalogue(id);
  if (!c) notFound();
  const { all } = await categoryCounts(id);
  return (
    <div>
      <CatalogueHeader catalogue={c} itemCount={all} compact />
      <ImportWizard catalogueId={id} catalogueName={c.name} />
    </div>
  );
}
