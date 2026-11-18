"use server";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSettings, nextNumber, getDefaultTaxRate, logActivity } from "@/lib/settings";
import { todayIso } from "@/lib/format";
import {
  NEW_CLIENT,
  isLeadStage,
  nextLeadNumber,
  parseLeadForm,
  rawLeadValues,
  defaultMarkupLines,
  type LeadFormState,
  type LeadInput,
} from "./lib";

type Lead = typeof schema.leads.$inferSelect;

async function getLead(id: string): Promise<Lead | undefined> {
  const [l] = await db.select().from(schema.leads).where(eq(schema.leads.id, id));
  return l;
}

function revalidateLead(id?: string) {
  revalidatePath("/leads");
  if (id) revalidatePath(`/leads/${id}`);
}

/** Creates a client from a lead's contact + site details and returns its id. */
async function insertClientFrom(d: Pick<LeadInput, "contactName" | "title" | "email" | "phone" | "address" | "cityTown" | "state" | "postcode" | "source">) {
  const [c] = await db
    .insert(schema.clients)
    .values({
      name: d.contactName || d.title,
      email: d.email,
      phone: d.phone,
      address: d.address,
      cityTown: d.cityTown,
      state: d.state,
      postcode: d.postcode,
      source: d.source,
    })
    .returning({ id: schema.clients.id, name: schema.clients.name });
  return c;
}

async function resolveClient(data: LeadInput): Promise<{ clientId: string | null; created?: string }> {
  if (data.clientId === NEW_CLIENT) {
    const c = await insertClientFrom(data);
    return { clientId: c.id, created: c.name };
  }
  if (data.clientId) {
    const [c] = await db.select({ id: schema.clients.id }).from(schema.clients).where(eq(schema.clients.id, data.clientId));
    return { clientId: c ? c.id : null };
  }
  return { clientId: null };
}

export async function createLead(_prev: LeadFormState, formData: FormData): Promise<LeadFormState> {
  const values = rawLeadValues(formData);
  const parsed = parseLeadForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values, message: "Please fix the highlighted fields." };
  const { clientId, created } = await resolveClient(parsed.data);
  const existing = await db.select({ number: schema.leads.number }).from(schema.leads);
  const number = nextLeadNumber(existing.map((e) => e.number));
  const [lead] = await db
    .insert(schema.leads)
    .values({ ...parsed.data, clientId, number })
    .returning({ id: schema.leads.id });
  await logActivity("lead", lead.id, "created", `Lead ${number} “${parsed.data.title}” created`);
  if (created) await logActivity("client", clientId!, "created", `Client ${created} created from lead ${number}`);
  revalidateLead();
  redirect(`/leads/${lead.id}`);
}

export async function updateLead(id: string, _prev: LeadFormState, formData: FormData): Promise<LeadFormState> {
  const lead = await getLead(id);
  if (!lead) return { message: "This lead no longer exists." };
  const values = rawLeadValues(formData);
  const parsed = parseLeadForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values, message: "Please fix the highlighted fields." };
  const { clientId, created } = await resolveClient(parsed.data);
  await db
    .update(schema.leads)
    .set({ ...parsed.data, clientId })
    .where(eq(schema.leads.id, id));
  if (lead.stage !== parsed.data.stage) await logActivity("lead", id, "stage", `Stage changed from ${lead.stage} to ${parsed.data.stage}`);
  else await logActivity("lead", id, "updated", `Lead ${lead.number} updated`);
  if (created) await logActivity("client", clientId!, "created", `Client ${created} created from lead ${lead.number}`);
  revalidateLead(id);
  return { ok: true, message: created ? `Saved. Client “${created}” created and linked.` : "Changes saved.", values: { ...values, clientId: clientId ?? "" } };
}

export async function setLeadStage(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const stage = formData.get("stage");
  const lead = await getLead(id);
  if (!lead || !isLeadStage(stage) || stage === lead.stage) return;
  await db
    .update(schema.leads)
    .set({ stage, lostReason: stage === "Lost" ? lead.lostReason : null })
    .where(eq(schema.leads.id, id));
  await logActivity("lead", id, "stage", `Stage changed from ${lead.stage} to ${stage}`);
  revalidateLead(id);
}

export async function markLeadWon(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const lead = await getLead(id);
  if (!lead) return;
  await db.update(schema.leads).set({ stage: "Won", lostReason: null, probability: 100 }).where(eq(schema.leads.id, id));
  await logActivity("lead", id, "won", `Lead ${lead.number} marked as won`);
  revalidateLead(id);
}

export async function markLeadLost(_prev: { error?: string; ok?: boolean }, formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("lostReason") ?? "").trim();
  if (!reason) return { error: "Tell us why the lead was lost." };
  if (reason.length > 500) return { error: "Keep the reason under 500 characters." };
  const lead = await getLead(id);
  if (!lead) return { error: "This lead no longer exists." };
  await db.update(schema.leads).set({ stage: "Lost", lostReason: reason, probability: 0 }).where(eq(schema.leads.id, id));
  await logActivity("lead", id, "lost", `Lead ${lead.number} marked as lost: ${reason}`);
  revalidateLead(id);
  return { ok: true };
}

export async function reopenLead(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const lead = await getLead(id);
  if (!lead) return;
  const hasEstimate = (await db.select({ id: schema.estimates.id }).from(schema.estimates).where(eq(schema.estimates.leadId, id)).limit(1)).length > 0;
  const stage = hasEstimate ? "Quoting" : "New";
  await db.update(schema.leads).set({ stage, lostReason: null }).where(eq(schema.leads.id, id));
  await logActivity("lead", id, "reopened", `Lead ${lead.number} reopened (${stage})`);
  revalidateLead(id);
}

export async function setLeadArchived(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const archived = formData.get("archived") === "1";
  const lead = await getLead(id);
  if (!lead) return;
  await db.update(schema.leads).set({ archived }).where(eq(schema.leads.id, id));
  await logActivity("lead", id, archived ? "archived" : "restored", `Lead ${lead.number} ${archived ? "archived" : "restored"}`);
  revalidateLead(id);
}

export async function deleteLead(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const lead = await getLead(id);
  if (lead) {
    await db.delete(schema.notes).where(and(eq(schema.notes.entityType, "lead"), eq(schema.notes.entityId, id)));
    await db.delete(schema.leads).where(eq(schema.leads.id, id));
    // Keep estimates but detach them from the deleted lead.
    await db.update(schema.estimates).set({ leadId: null }).where(eq(schema.estimates.leadId, id));
    await logActivity("lead", id, "deleted", `Lead ${lead.number} “${lead.title}” deleted`);
  }
  revalidateLead();
  redirect("/leads");
}

export async function createClientFromLead(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const lead = await getLead(id);
  if (!lead || lead.clientId) return;
  const c = await insertClientFrom(lead);
  await db.update(schema.leads).set({ clientId: c.id }).where(eq(schema.leads.id, id));
  await logActivity("client", c.id, "created", `Client ${c.name} created from lead ${lead.number}`);
  await logActivity("lead", id, "updated", `Linked to new client ${c.name}`);
  revalidateLead(id);
}

export async function convertLeadToEstimate(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const lead = await getLead(id);
  if (!lead) redirect("/leads");
  const client = lead.clientId
    ? (await db.select().from(schema.clients).where(eq(schema.clients.id, lead.clientId)))[0]
    : undefined;
  const settings = await getSettings();
  const tax = await getDefaultTaxRate();
  const number = await nextNumber("Estimate");
  const [est] = await db
    .insert(schema.estimates)
    .values({
      number,
      name: lead.title,
      status: "Draft",
      leadId: lead.id,
      clientId: client?.id ?? null,
      clientName: client?.name ?? lead.contactName,
      clientEmail: client?.email ?? lead.email,
      clientMobile: client?.mobile ?? null,
      clientPhone: client ? client.phone : lead.phone,
      clientAddress: client?.address ?? lead.address,
      clientCityTown: client?.cityTown ?? lead.cityTown,
      clientState: client?.state ?? lead.state,
      clientPostcode: client?.postcode ?? lead.postcode,
      source: lead.source,
      siteAddress: lead.address,
      siteCityTown: lead.cityTown,
      siteState: lead.state,
      sitePostcode: lead.postcode,
      buildingType: lead.buildingType,
      markupLines: defaultMarkupLines(settings.defaultMarkupPercent),
      taxRateId: tax.id || null,
      datePrepared: todayIso(),
    })
    .returning({ id: schema.estimates.id });
  await db.update(schema.leads).set({ stage: "Quoting" }).where(eq(schema.leads.id, id));
  await logActivity("lead", id, "converted", `Lead ${lead.number} converted to estimate ${number}`);
  await logActivity("estimate", est.id, "created", `Estimate ${number} created from lead ${lead.number}`);
  revalidateLead(id);
  revalidatePath("/estimates");
  redirect(`/estimates/${est.id}`);
}
