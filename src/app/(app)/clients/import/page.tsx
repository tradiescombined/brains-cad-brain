import { PageHeader } from "@/components/ui";
import { importClients } from "../actions";
import { CsvImport } from "../CsvImport";
import { CLIENT_FIELDS } from "../fields";

export const metadata = { title: "Import clients" };

const SAMPLE = `Name,Business name,Email,Mobile,Suburb,State,Postcode,Source
Priya Shah,,priya@example.com,0412 345 678,Paddington,QLD,4064,Referral
Tom Walsh,Walsh Property Group,tom@example.com,0498 765 432,Newstead,QLD,4006,Website`;

export default function ImportClientsPage() {
  return (
    <div>
      <PageHeader
        title="Import clients"
        subtitle="Bring clients across from a spreadsheet or another system. Rows with problems are skipped and listed after import."
        back={{ href: "/clients", label: "Clients" }}
        actions={<a href="/api/export/clients" className="text-sm font-medium text-brand-700 hover:underline">Download current clients as CSV</a>}
      />
      <CsvImport kind="clients" fields={CLIENT_FIELDS} onImport={importClients} listHref="/clients" noun="client" sample={SAMPLE} />
    </div>
  );
}
