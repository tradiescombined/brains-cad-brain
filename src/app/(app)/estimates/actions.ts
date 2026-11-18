"use server";
import { syncLeadWithEstimate } from "@/lib/estimates";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getDefaultTaxRate, getSettings, logActivity, nextNumber } from "@/lib/settings";
import { recalcEstimate } from "@/lib/estimates";
import { todayIso } from "@/lib/format";
import {
  acceptedStatusName,
  allocateTemplateNumber,
  cloneEstimate,
  copyEstimateContent,
  deleteEstimateCascade,
  firstStatusName,
} from "./_components/estimate-db";
import { formValues, statusPatch, str, type FormState } from "./_components/logic";

function revalidateEstimate(id: string) {
  revalidatePath("/estimates");
  revalidatePath("/estimates/templates");
  revalidatePath(`/estimates/${id}`, "layout");
}

/* ------------------------------------------------------------------ create */

/** Creates an estimate (blank or from a template) from the /estimates/new form. */
export async function createEstimate(_prev: FormState, fd: FormData): Promise<FormState> {
  const name = str(fd, "name", 200);
  const templateId = str(fd, "templateId");
  const asTemplate = fd.get("asTemplate") === "1";
  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Give the estimate a name.";

  let template: typeof schema.estimates.$inferSelect | undefined;
  if (templateId) {
    [template] = await db.select().from(schema.estimates).where(and(eq(schema.estimates.id, templateId), eq(schema.estimates.isTemplate, true)));
    if (!template) fieldErrors.templateId = "That template is no longer available.";
  }

  // Client: pick an existing one, or type a new name to create one.
  const clientId = str(fd, "clientId");
  const typedClient = str(fd, "clientName", 200);
  let client: typeof schema.clients.$inferSelect | undefined;
  if (!asTemplate && clientId) {
    [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId));
    if (!client) fieldErrors.clientName = "That client could not be found. Pick again or type a new name.";
  }
  if (Object.keys(fieldErrors).length) return { error: "Please fix the highlighted fields.", fieldErrors, values: formValues(fd) };

  if (!asTemplate && !client && typedClient) {
    [client] = await db.insert(schema.clients).values({ name: typedClient }).returning();
    await logActivity("client", client.id, "created", `Client ${client.name} added from a new estimate`);
  }

  const settings = await getSettings();
  const tax = await getDefaultTaxRate();
  const site = {
    siteAddress: str(fd, "siteAddress"),
    siteCityTown: str(fd, "siteCityTown", 100),
    siteState: str(fd, "siteState", 50),
    sitePostcode: str(fd, "sitePostcode", 20),
  };
  const siteBlank = !site.siteAddress && !site.siteCityTown && !site.siteState && !site.sitePostcode;
  const clientSnap = client
    ? {
        clientId: client.id, clientName: client.name, clientEmail: client.email, clientMobile: client.mobile, clientPhone: client.phone,
        clientAddress: client.address, clientCityTown: client.cityTown, clientState: client.state, clientPostcode: client.postcode, source: client.source,
      }
    : {};
  const siteFinal = siteBlank && client
    ? { siteAddress: client.address, siteCityTown: client.cityTown, siteState: client.state, sitePostcode: client.postcode }
    : site;

  const base = {
    name: name!,
    number: asTemplate ? await allocateTemplateNumber() : await nextNumber("Estimate"),
    status: await firstStatusName(),
    buildingType: str(fd, "buildingType", 100) ?? template?.buildingType ?? null,
    datePrepared: todayIso(),
    isTemplate: asTemplate,
    ...(asTemplate ? {} : { ...clientSnap, ...siteFinal }),
  };
  const pricing = template
    ? {
        markupLines: template.markupLines,
        taxRateId: template.taxRateId ?? (tax.id || null),
        pcpsRedistribution: template.pcpsRedistribution,
        rounding: template.rounding,
        specificationIntro: template.specificationIntro,
      }
    : {
        markupLines: JSON.stringify([{ name: "Markup", percent: settings.defaultMarkupPercent }]),
        taxRateId: settings.defaultTaxRateId || tax.id || null,
      };

  const [est] = await db.insert(schema.estimates).values({ ...base, ...pricing }).returning();
  if (template) await copyEstimateContent(template.id, est.id);
  else await recalcEstimate(est.id);
  await logActivity("estimate", est.id, "created", `${asTemplate ? "Template" : "Estimate"} ${est.number} ${est.name} created${template ? ` from template ${template.name}` : ""}`);
  revalidatePath("/estimates");
  revalidatePath("/estimates/templates");
  redirect(`/estimates/${est.id}`);
}

/* ------------------------------------------------------------------ header actions */

export async function setEstimateStatus(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const status = str(fd, "status", 100);
  const [est] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, id));
  if (!est || !status || status === est.status) return;
  const patch = statusPatch(status, await acceptedStatusName(), est.acceptedAt);
  await db.update(schema.estimates).set(patch).where(eq(schema.estimates.id, id));
  await syncLeadWithEstimate(id);
  revalidatePath("/leads", "layout");
  await logActivity("estimate", id, "status", `${est.number} status changed from ${est.status} to ${status}`);
  revalidateEstimate(id);
}

export async function duplicateEstimate(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const [src] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, id));
  if (!src) return;
  const newId = await cloneEstimate(id, { name: `${src.name} (copy)`.slice(0, 200), isTemplate: src.isTemplate, datePrepared: todayIso() });
  if (!newId) return;
  await logActivity("estimate", newId, "created", `Duplicated from ${src.number} ${src.name}`);
  revalidatePath("/estimates");
  revalidatePath("/estimates/templates");
  redirect(`/estimates/${newId}`);
}

export async function saveAsTemplate(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const [src] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, id));
  if (!src) return;
  const name = str(fd, "name", 200) ?? `${src.name} template`;
  const newId = await cloneEstimate(id, {
    name, isTemplate: true, clientId: null, leadId: null, clientName: null, clientEmail: null, clientMobile: null, clientPhone: null,
    clientAddress: null, clientCityTown: null, clientState: null, clientPostcode: null, source: null,
    siteAddress: null, siteCityTown: null, siteState: null, sitePostcode: null, datePrepared: null,
  });
  if (!newId) return;
  await logActivity("estimate", newId, "created", `Template "${name}" saved from ${src.number}`);
  revalidatePath("/estimates/templates");
  redirect(`/estimates/templates?saved=${newId}`);
}

export async function setArchived(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const archived = fd.get("archived") === "1";
  await db.update(schema.estimates).set({ archived }).where(eq(schema.estimates.id, id));
  await logActivity("estimate", id, archived ? "archived" : "unarchived", archived ? "Estimate archived" : "Estimate restored from archive");
  revalidateEstimate(id);
}

/** Permanently deletes an estimate or template. Only allowed for templates and archived estimates. */
export async function deleteEstimate(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const [est] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, id));
  if (!est) return;
  if (!est.isTemplate && !est.archived) return;
  if (est.jobId) return;
  await deleteEstimateCascade(id);
  await logActivity("estimate", id, "deleted", `${est.isTemplate ? "Template" : "Estimate"} ${est.number} ${est.name} deleted`);
  revalidatePath("/estimates");
  revalidatePath("/estimates/templates");
  const back = String(fd.get("redirectTo") ?? "");
  if (back.startsWith("/")) redirect(back);
}

/* ------------------------------------------------------------------ templates */

export async function createBlankTemplate(_prev: FormState, fd: FormData): Promise<FormState> {
  const fdd = new FormData();
  const name = str(fd, "name", 200);
  if (!name) return { error: "Name the template.", fieldErrors: { name: "Name the template." } };
  fdd.set("name", name);
  fdd.set("asTemplate", "1");
  const bt = str(fd, "buildingType");
  if (bt) fdd.set("buildingType", bt);
  return createEstimate(undefined, fdd);
}

export async function renameTemplate(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = String(fd.get("id") ?? "");
  const name = str(fd, "name", 200);
  if (!name) return { error: "Name can't be empty." };
  const res = await db
    .update(schema.estimates)
    .set({ name, buildingType: str(fd, "buildingType", 100) })
    .where(and(eq(schema.estimates.id, id), eq(schema.estimates.isTemplate, true)))
    .returning({ id: schema.estimates.id });
  if (!res.length) return { error: "Template not found." };
  revalidateEstimate(id);
  return { ok: true, message: "Saved" };
}

/** Make a template the preselected starting point for new estimates (or clear it). */
export async function setDefaultTemplate(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const s = await getSettings();
  let next: string | null = null;
  if (id && fd.get("clear") !== "1") {
    const [t] = await db.select({ id: schema.estimates.id }).from(schema.estimates).where(and(eq(schema.estimates.id, id), eq(schema.estimates.isTemplate, true)));
    if (!t) return;
    next = t.id;
  }
  await db.update(schema.businessSettings).set({ defaultTemplateId: next }).where(eq(schema.businessSettings.id, s.id));
  revalidatePath("/estimates/templates");
  revalidatePath("/estimates/new");
}
