import { PageHeader } from "@/components/ui";
import { CsvImport } from "../../clients/CsvImport";
import { importContacts } from "../actions";
import { CONTACT_FIELDS } from "../fields";

export const metadata = { title: "Import suppliers & trades" };

const SAMPLE = `Name,Type,Trade,Groups,Email,Mobile,Insurance expiry,Payment terms,Rating
Coastal Roofing,Subcontractor,Roofer,Roofing,jobs@example.com,0400 111 222,30/06/2027,14,5
Brick & Block Supplies,Supplier,,Concreting;Carpentry,sales@example.com,,,30,4`;

export default function ImportContactsPage() {
  return (
    <div>
      <PageHeader
        title="Import suppliers & trades"
        subtitle="Separate multiple groups with a semicolon. Dates can be 2027-06-30 or 30/06/2027."
        back={{ href: "/contacts", label: "Suppliers & trades" }}
        actions={<a href="/api/export/contacts" className="text-sm font-medium text-brand-700 hover:underline">Download current list as CSV</a>}
      />
      <CsvImport kind="contacts" fields={CONTACT_FIELDS} onImport={importContacts} listHref="/contacts" noun="contact" sample={SAMPLE} />
    </div>
  );
}
