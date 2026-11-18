"use server";
import { denied, requirePermission } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { recalcEstimate } from "@/lib/estimates";
import { getLookups, logActivity } from "@/lib/settings";
import { acceptedStatusName, captureVersion, restoreVersion } from "../_components/estimate-db";
import { formValues, isEmail, isIsoDate, isPcps, isRounding, statusPatch, str, type FormState } from "../_components/logic";

function revalidate(id: string) {
  revalidatePath(`/estimates/${id}`, "layout");
  revalidatePath("/estimates");
}

/** Saves the Details tab. Always recalculates, since tax / redistribution / rounding affect totals. */
export async function saveDetails(_prev: FormState, fd: FormData): Promise<FormState> {
  const denial = await denied("estimates.edit");
  if (denial) return { error: denial, at: Date.now() };
  const id = String(fd.get("id") ?? "");
  const [est] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, id));
  if (!est) return { error: "This estimate no longer exists." };

  const fe: Record<string, string> = {};
  const name = str(fd, "name", 200);
  const number = str(fd, "number", 40);
  const datePrepared = str(fd, "datePrepared", 10);
  const status = str(fd, "status", 100) ?? est.status;
  const clientEmail = str(fd, "clientEmail", 200);
  const leadId = str(fd, "leadId");
  const taxRateId = str(fd, "taxRateId");
  const pcps = String(fd.get("pcpsRedistribution") ?? est.pcpsRedistribution);
  const rounding = String(fd.get("rounding") ?? est.rounding);
  let clientLink = str(fd, "clientLink");

  if (!name) fe.name = "Name is required.";
  if (!number) fe.number = "Number is required.";
  else if (number !== est.number) {
    const clash = await db.select({ id: schema.estimates.id }).from(schema.estimates).where(and(eq(schema.estimates.number, number), ne(schema.estimates.id, id)));
    if (clash.length) fe.number = `${number} is already used by another estimate.`;
  }
  if (datePrepared && !isIsoDate(datePrepared)) fe.datePrepared = "Enter a valid date.";
  if (clientEmail && !isEmail(clientEmail)) fe.clientEmail = "That email doesn't look right.";
  const statuses = (await getLookups("estimate_status")).map((s) => s.name);
  if (status !== est.status && !statuses.includes(status)) fe.status = "Pick a status from the list.";
  if (!isPcps(pcps)) fe.pcpsRedistribution = "Pick an option.";
  if (!isRounding(rounding)) fe.rounding = "Pick an option.";
  if (leadId) {
    const [l] = await db.select({ id: schema.leads.id }).from(schema.leads).where(eq(schema.leads.id, leadId));
    if (!l) fe.leadId = "That lead no longer exists.";
  }
  if (taxRateId) {
    const [t] = await db.select({ id: schema.taxRates.id }).from(schema.taxRates).where(eq(schema.taxRates.id, taxRateId));
    if (!t) fe.taxRateId = "That tax rate no longer exists.";
  }
  const clientName = str(fd, "clientName", 200);
  if (clientLink && clientLink !== "__new") {
    const [c] = await db.select({ id: schema.clients.id }).from(schema.clients).where(eq(schema.clients.id, clientLink));
    if (!c) fe.clientLink = "That client no longer exists.";
  }
  if (clientLink === "__new" && !clientName) fe.clientName = "Enter the client's name to create a client record.";
  if (Object.keys(fe).length) return { error: "Please fix the highlighted fields.", fieldErrors: fe, values: formValues(fd), at: Date.now() };

  const client = {
    clientName,
    clientEmail,
    clientMobile: str(fd, "clientMobile", 50),
    clientPhone: str(fd, "clientPhone", 50),
    clientAddress: str(fd, "clientAddress"),
    clientCityTown: str(fd, "clientCityTown", 100),
    clientState: str(fd, "clientState", 50),
    clientPostcode: str(fd, "clientPostcode", 20),
    source: str(fd, "source", 100),
  };

  if (clientLink === "__new") {
    const [c] = await db
      .insert(schema.clients)
      .values({
        name: clientName!, email: client.clientEmail, mobile: client.clientMobile, phone: client.clientPhone, address: client.clientAddress,
        cityTown: client.clientCityTown, state: client.clientState, postcode: client.clientPostcode, source: client.source,
      })
      .returning();
    clientLink = c.id;
    await logActivity("client", c.id, "created", `Client ${c.name} created from estimate ${est.number}`);
  }

  const siteSame = fd.get("siteSame") === "on";
  const site = siteSame
    ? { siteAddress: client.clientAddress, siteCityTown: client.clientCityTown, siteState: client.clientState, sitePostcode: client.clientPostcode }
    : {
        siteAddress: str(fd, "siteAddress"),
        siteCityTown: str(fd, "siteCityTown", 100),
        siteState: str(fd, "siteState", 50),
        sitePostcode: str(fd, "sitePostcode", 20),
      };

  const statusFields = status !== est.status ? statusPatch(status, await acceptedStatusName(), est.acceptedAt) : {};

  await db
    .update(schema.estimates)
    .set({
      name: name!,
      number: number!,
      datePrepared,
      buildingType: str(fd, "buildingType", 100),
      clientId: clientLink,
      ...client,
      ...site,
      leadId,
      taxRateId,
      pcpsRedistribution: pcps,
      rounding,
      ...statusFields,
    })
    .where(eq(schema.estimates.id, id));
  await recalcEstimate(id);
  if (status !== est.status) await logActivity("estimate", id, "status", `${number} status changed from ${est.status} to ${status}`);
  else await logActivity("estimate", id, "updated", `${number} details updated`);
  revalidate(id);
  return { ok: true, message: "Changes saved", at: Date.now() };
}

/* ------------------------------------------------------------------ versions */

export async function captureVersionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const denial = await denied("estimates.edit");
  if (denial) return { error: denial, at: Date.now() };
  const id = String(fd.get("estimateId") ?? "");
  const label = str(fd, "label", 120);
  if (!label) return { error: "Give the version a label, e.g. “Before client changes”.", at: Date.now() };
  const v = await captureVersion(id, label);
  if (!v) return { error: "This estimate no longer exists.", at: Date.now() };
  await logActivity("estimate", id, "version", `Version "${label}" captured`);
  revalidatePath(`/estimates/${id}`);
  return { ok: true, message: `Captured “${label}”`, at: Date.now() };
}

export async function restoreVersionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const denial = await denied("estimates.edit");
  if (denial) return { error: denial, at: Date.now() };
  const id = String(fd.get("estimateId") ?? "");
  const versionId = String(fd.get("versionId") ?? "");
  const [v] = await db.select({ estimateId: schema.estimateVersions.estimateId }).from(schema.estimateVersions).where(eq(schema.estimateVersions.id, versionId));
  if (!v || v.estimateId !== id) return { error: "That version no longer exists.", at: Date.now() };
  const r = await restoreVersion(versionId);
  if (!r.ok) return { error: r.error, at: Date.now() };
  await logActivity("estimate", id, "version", `Restored version "${r.label}"`);
  revalidate(id);
  return { ok: true, message: `Restored “${r.label}”. The previous state was saved as a version.`, at: Date.now() };
}

export async function deleteVersionAction(fd: FormData) {
  await requirePermission("estimates.edit");
  const id = String(fd.get("estimateId") ?? "");
  const versionId = String(fd.get("versionId") ?? "");
  await db.delete(schema.estimateVersions).where(and(eq(schema.estimateVersions.id, versionId), eq(schema.estimateVersions.estimateId, id)));
  revalidatePath(`/estimates/${id}`);
}
