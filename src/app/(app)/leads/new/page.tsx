import { Card, LinkButton, PageHeader } from "@/components/ui";
import { addDays, todayIso } from "@/lib/format";
import { LeadForm } from "../LeadForm";
import { createLead } from "../actions";
import { getLeadFormOptions } from "../data";
import { isLeadStage, toFormValues } from "../lib";

export const metadata = { title: "New lead" };

export default async function NewLeadPage({ searchParams }: { searchParams: Promise<{ clientId?: string; stage?: string }> }) {
  const sp = await searchParams;
  const opts = await getLeadFormOptions();
  const client = sp.clientId ? opts.clients.find((c) => c.id === sp.clientId) : undefined;
  const initial = toFormValues({
    stage: isLeadStage(sp.stage) ? sp.stage : "New",
    probability: 20,
    followUpDate: addDays(todayIso(), 2),
    assignedTo: opts.users[0]?.id,
    ...(client && {
      clientId: client.id,
      contactName: client.name,
      email: client.email,
      phone: client.phone ?? client.mobile,
      address: client.address,
      cityTown: client.cityTown,
      state: client.state,
      postcode: client.postcode,
    }),
  });
  return (
    <div className="max-w-4xl">
      <PageHeader title="New lead" subtitle="Capture the enquiry now; you can fill in the gaps later." back={{ href: "/leads", label: "Leads" }} />
      <Card>
        <LeadForm
          action={createLead}
          initial={initial}
          {...opts}
          submitLabel="Create lead"
          cancel={
            <LinkButton variant="secondary" href="/leads">
              Cancel
            </LinkButton>
          }
        />
      </Card>
    </div>
  );
}
