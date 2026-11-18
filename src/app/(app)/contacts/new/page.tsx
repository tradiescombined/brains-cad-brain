import { PageHeader } from "@/components/ui";
import { getLookups } from "@/lib/settings";
import { createContact } from "../actions";
import { ContactForm } from "../ContactForm";

export const metadata = { title: "New supplier or trade" };

export default async function NewContactPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const sp = await searchParams;
  const [types, groups] = await Promise.all([getLookups("contact_type"), getLookups("contact_group")]);
  return (
    <div>
      <PageHeader title="New supplier or trade" subtitle="Suppliers, subcontractors, consultants and other businesses you work with." back={{ href: "/contacts", label: "Suppliers & trades" }} />
      <ContactForm
        action={createContact}
        initial={{ contactType: sp.type ?? "" }}
        types={types.map((l) => l.name)}
        groups={groups.map((l) => l.name)}
        submitLabel="Create contact"
        cancelHref="/contacts"
      />
    </div>
  );
}
