import { requirePermission } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { getLookups } from "@/lib/settings";
import { createClient } from "../actions";
import { ClientForm } from "../ClientForm";

export const metadata = { title: "New client" };

export default async function NewClientPage({ searchParams }: { searchParams: Promise<{ name?: string; type?: string }> }) {
  await requirePermission("clients.edit");
  const sp = await searchParams;
  const [sources, categories] = await Promise.all([getLookups("client_source"), getLookups("client_type")]);
  return (
    <div>
      <PageHeader title="New client" subtitle="Add a homeowner, developer or business you quote for." back={{ href: "/clients", label: "Clients" }} />
      <ClientForm
        action={createClient}
        initial={{ name: sp.name ?? "", clientType: sp.type === "Business" ? "Business" : "Person" }}
        sources={sources.map((l) => l.name)}
        categories={categories.map((l) => l.name)}
        submitLabel="Create client"
        cancelHref="/clients"
      />
    </div>
  );
}
