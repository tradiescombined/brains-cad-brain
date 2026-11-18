import { DocumentsPanel } from "@/components/records";

export const metadata = { title: "Business documents · Settings" };

/** Company-wide files (licences, insurance certificates, templates, brochures) not tied to one record. */
export default function BusinessDocumentsPage() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-500">
        Keep company-wide files here — builder&apos;s licence, insurance certificates, contract templates, brochures — so they&apos;re handy for any quote or job.
      </p>
      <DocumentsPanel entityType="business" entityId="business" path="/settings/documents" />
    </div>
  );
}
