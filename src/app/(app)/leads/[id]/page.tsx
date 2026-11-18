import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, Button, Card, DescList, statusTone } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { NotesPanel } from "@/components/records";
import { cx, date, money, todayIso } from "@/lib/format";
import { LeadForm } from "../LeadForm";
import { DeleteLeadButton, MarkLostButton } from "../LeadControls";
import { getLeadFormOptions } from "../data";
import { isFollowUpOverdue, toFormValues, weightedValue } from "../lib";
import { convertLeadToEstimate, createClientFromLead, markLeadWon, reopenLead, setLeadArchived, updateLead } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [l] = await db.select({ number: schema.leads.number, title: schema.leads.title }).from(schema.leads).where(eq(schema.leads.id, id));
  return { title: l ? `${l.number} ${l.title}` : "Lead" };
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, id));
  if (!lead) notFound();

  const [opts, client, estimates, activity] = await Promise.all([
    getLeadFormOptions(),
    lead.clientId ? db.select().from(schema.clients).where(eq(schema.clients.id, lead.clientId)).then((r) => r[0]) : undefined,
    db
      .select({ id: schema.estimates.id, number: schema.estimates.number, name: schema.estimates.name, status: schema.estimates.status, quoteTotal: schema.estimates.quoteTotal, datePrepared: schema.estimates.datePrepared })
      .from(schema.estimates)
      .where(and(eq(schema.estimates.leadId, id), eq(schema.estimates.archived, false)))
      .orderBy(desc(schema.estimates.createdAt)),
    db
      .select()
      .from(schema.activity)
      .where(and(eq(schema.activity.entityType, "lead"), eq(schema.activity.entityId, id)))
      .orderBy(desc(schema.activity.createdAt))
      .limit(12),
  ]);

  // Archived clients are hidden from the picker; keep the linked one selectable.
  if (client && !opts.clients.some((c) => c.id === client.id)) opts.clients.unshift(client);

  const closed = lead.stage === "Won" || lead.stage === "Lost";
  const overdue = isFollowUpOverdue(lead.followUpDate, lead.stage, todayIso());
  const assignee = opts.users.find((u) => u.id === lead.assignedTo)?.name;
  const idField = <input type="hidden" name="id" value={lead.id} />;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/leads" className="text-xs font-medium text-ink-500 hover:text-brand-700">
            ← Leads
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-ink-900">{lead.title}</h1>
            <span data-testid="lead-stage"><Badge tone={statusTone(lead.stage)}>{lead.stage}</Badge></span>
            {lead.archived && <Badge tone="amber">Archived</Badge>}
          </div>
          <div className="mt-1 text-sm text-ink-500">
            <span data-testid="lead-number">{lead.number}</span>
            {(client?.name ?? lead.contactName) ? ` · ${client?.name ?? lead.contactName}` : ""}
            {lead.cityTown ? ` · ${lead.cityTown}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={convertLeadToEstimate}>
            {idField}
            <SubmitButton pendingText="Creating estimate…">Convert to estimate</SubmitButton>
          </form>
          {closed ? (
            <form action={reopenLead}>
              {idField}
              <SubmitButton variant="secondary">Reopen lead</SubmitButton>
            </form>
          ) : (
            <>
              <form action={markLeadWon}>
                {idField}
                <SubmitButton variant="secondary">Mark won</SubmitButton>
              </form>
              <MarkLostButton id={lead.id} defaultReason={lead.lostReason} />
            </>
          )}
          <form action={setLeadArchived}>
            {idField}
            <input type="hidden" name="archived" value={lead.archived ? "0" : "1"} />
            <Button variant="ghost" type="submit">{lead.archived ? "Restore" : "Archive"}</Button>
          </form>
          <DeleteLeadButton id={lead.id} />
        </div>
      </div>

      {lead.stage === "Lost" && lead.lostReason && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800" data-testid="lost-reason">
          <span className="font-semibold">Lost:</span> {lead.lostReason}
        </div>
      )}
      {lead.archived && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">This lead is archived and hidden from the pipeline. Restore it to bring it back.</div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Lead details">
            <LeadForm action={updateLead.bind(null, lead.id)} initial={toFormValues(lead)} {...opts} submitLabel="Save changes" />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Summary">
            <DescList
              items={[
                ["Estimated value", lead.estimatedValue != null ? <span className="tabular-nums">{money(lead.estimatedValue, { cents: false })}</span> : null],
                ["Probability", lead.probability != null ? `${lead.probability}%` : null],
                ["Weighted value", <span key="w" className="tabular-nums">{money(weightedValue(lead.estimatedValue, lead.probability), { cents: false })}</span>],
                ["Follow-up", lead.followUpDate ? <span key="f" className={cx(overdue && "font-medium text-red-600")}>{date(lead.followUpDate)}{overdue ? " · overdue" : ""}</span> : null],
                ["Expected start", date(lead.expectedStart)],
                ["Assigned to", assignee],
                ["Source", lead.source],
                ["Created", date(lead.createdAt)],
              ]}
            />
          </Card>

          <Card title="Client">
            {client ? (
              <div className="text-sm">
                <Link href={`/clients/${client.id}`} className="font-medium text-brand-700 hover:underline" data-testid="linked-client">
                  {client.name}
                </Link>
                <div className="mt-1 space-y-0.5 text-ink-600">
                  {client.email && <div>{client.email}</div>}
                  {(client.mobile || client.phone) && <div>{client.mobile || client.phone}</div>}
                  {client.address && <div>{[client.address, client.cityTown, client.state, client.postcode].filter(Boolean).join(", ")}</div>}
                </div>
              </div>
            ) : (
              <div className="text-sm text-ink-600">
                <p>Not linked to a client yet.</p>
                <form action={createClientFromLead} className="mt-3">
                  {idField}
                  <SubmitButton variant="secondary" pendingText="Creating…">Create client from contact</SubmitButton>
                </form>
              </div>
            )}
          </Card>

          <Card title={`Estimates (${estimates.length})`} pad={false}>
            {estimates.length === 0 ? (
              <p className="p-4 text-sm text-ink-500">No estimates yet. Convert this lead to start pricing the work.</p>
            ) : (
              <ul className="divide-y divide-ink-100" data-testid="lead-estimates">
                {estimates.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      <Link href={`/estimates/${e.id}`} className="font-medium text-brand-700 hover:underline">
                        {e.number}
                      </Link>{" "}
                      <span className="text-ink-700">{e.name}</span>
                      <div className="text-xs text-ink-500">{date(e.datePrepared)}</div>
                    </div>
                    <div className="text-right">
                      <Badge tone={statusTone(e.status)}>{e.status}</Badge>
                      <div className="mt-0.5 text-xs tabular-nums text-ink-700">{money(e.quoteTotal)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <NotesPanel entityType="lead" entityId={lead.id} path={`/leads/${lead.id}`} />

          <Card title="Activity">
            {activity.length === 0 ? (
              <p className="text-sm text-ink-500">No activity yet.</p>
            ) : (
              <ol className="space-y-2" data-testid="lead-activity">
                {activity.map((a) => (
                  <li key={a.id} className="text-sm">
                    <div className="text-ink-800">{a.summary}</div>
                    <div className="text-xs text-ink-400">{date(a.createdAt)}</div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
