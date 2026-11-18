"use server";
import { canManageUser, checkPermission, denied, lastOwnerError, requirePermission } from "@/lib/permissions";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { getSettings } from "@/lib/settings";
import { errState, issuesToFieldErrors, okState, type ActionState } from "./_components/action-state";
import {
  businessSchema, userSchema, taxRateSchema, numberingSchema, quoteDefaultsSchema, lookupNameSchema,
  formToObject, minSafeNext, moveInOrder, isDuplicateName, NUMBERING_KINDS, MAX_LOGO_BYTES, LOGO_TYPES,
} from "./validation";

const FIX = "Please fix the highlighted fields.";
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function revalidateAll() {
  // Settings feed the sidebar (business name), dashboard and every module's defaults.
  revalidatePath("/", "layout");
}

/* ───────────────────────── Business details ───────────────────────── */

export async function saveBusiness(_p: ActionState, fd: FormData): Promise<ActionState> {
  const denial = await denied("settings.manage");
  if (denial) return errState(denial);
  const r = businessSchema.safeParse(formToObject(fd));
  if (!r.success) return errState(FIX, issuesToFieldErrors(r.error.issues));
  const cur = await getSettings();
  let logoDataUrl = cur.logoDataUrl;
  const file = fd.get("logo");
  if (fd.get("removeLogo") === "on") logoDataUrl = null;
  if (file instanceof File && file.size > 0) {
    if (!LOGO_TYPES.includes(file.type)) return errState(FIX, { logo: "Upload a PNG, JPG, SVG, WebP or GIF image" });
    if (file.size > MAX_LOGO_BYTES) return errState(FIX, { logo: "Logo must be 1 MB or smaller" });
    logoDataUrl = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
  }
  await db.update(schema.businessSettings).set({ ...r.data, logoDataUrl }).where(eq(schema.businessSettings.id, cur.id));
  revalidateAll();
  return okState("Business details saved");
}

/* ───────────────────────── Users ───────────────────────── */

async function activeOwnerCount(excludeId?: string) {
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.role, "Owner"), eq(schema.users.active, true), excludeId ? ne(schema.users.id, excludeId) : undefined));
  return rows.length;
}

export async function saveUser(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await checkPermission("users.manage");
  if (!actor.ok) return errState(actor.error);
  const r = userSchema.safeParse(formToObject(fd));
  if (!r.success) return errState(FIX, issuesToFieldErrors(r.error.issues));
  const id = s(fd, "id") || undefined;
  const email = r.data.email.toLowerCase();
  const clash = await db.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`);
  if (clash.some((c) => c.id !== id)) return errState(FIX, { email: "Another user already has this email" });
  if (id) {
    const [cur] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    if (!cur) return errState("That user no longer exists.");
    const notAllowed = canManageUser(actor.user.role, cur, r.data.role);
    if (notAllowed) return errState(notAllowed, { role: notAllowed });
    const lastOwner = lastOwnerError(cur, r.data, await activeOwnerCount(id));
    if (lastOwner) return errState(lastOwner, { role: "Keep at least one active Owner" });
    await db.update(schema.users).set({ ...r.data, email }).where(eq(schema.users.id, id));
    revalidatePath("/settings/users");
    return okState(`${r.data.firstName} updated`);
  }
  const notAllowed = canManageUser(actor.user.role, null, r.data.role);
  if (notAllowed) return errState(notAllowed, { role: notAllowed });
  await db.insert(schema.users).values({ ...r.data, email });
  revalidatePath("/settings/users");
  return okState(`${r.data.firstName} added`);
}

export async function deleteUser(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await checkPermission("users.manage");
  if (!actor.ok) return errState(actor.error);
  const id = s(fd, "id");
  const [cur] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!cur) return errState("That user no longer exists.");
  const notAllowed = canManageUser(actor.user.role, cur);
  if (notAllowed) return errState(notAllowed);
  const lastOwner = lastOwnerError(cur, null, await activeOwnerCount(id));
  if (lastOwner) return errState(lastOwner);
  await db.delete(schema.users).where(eq(schema.users.id, id));
  revalidatePath("/settings/users");
  return okState("User deleted");
}

/* ───────────────────────── Tax rates ───────────────────────── */

async function makeDefaultTaxRate(id: string, appliesTo: "income" | "expense") {
  await db.update(schema.taxRates).set({ isDefault: false }).where(and(eq(schema.taxRates.appliesTo, appliesTo), ne(schema.taxRates.id, id)));
  await db.update(schema.taxRates).set({ isDefault: true, active: true }).where(eq(schema.taxRates.id, id));
  if (appliesTo === "income") {
    const cur = await getSettings();
    await db.update(schema.businessSettings).set({ defaultTaxRateId: id }).where(eq(schema.businessSettings.id, cur.id));
  }
}

export async function saveTaxRate(_p: ActionState, fd: FormData): Promise<ActionState> {
  const denial = await denied("settings.manage");
  if (denial) return errState(denial);
  const r = taxRateSchema.safeParse(formToObject(fd));
  if (!r.success) return errState(FIX, issuesToFieldErrors(r.error.issues));
  const id = s(fd, "id") || undefined;
  const { ratePercent, ...rest } = r.data;
  const all = await db.select().from(schema.taxRates);
  if (all.some((t) => t.id !== id && t.code.toUpperCase() === rest.code && t.appliesTo === rest.appliesTo))
    return errState(FIX, { code: `Code ${rest.code} is already used for ${rest.appliesTo}` });
  const values = { ...rest, rate: Math.round(ratePercent * 10000) / 1_000_000 };
  const cur = id ? all.find((t) => t.id === id) : undefined;
  if (id && !cur) return errState("That tax rate no longer exists.");
  if (cur?.isDefault && (!values.isDefault || !values.active || values.appliesTo !== cur.appliesTo))
    return errState("Choose another default first.", { isDefault: "This is the default rate — make another rate the default before changing this." });
  let savedId = id;
  if (id) await db.update(schema.taxRates).set({ ...values, isDefault: cur!.isDefault }).where(eq(schema.taxRates.id, id));
  else [{ id: savedId }] = await db.insert(schema.taxRates).values({ ...values, isDefault: false }).returning({ id: schema.taxRates.id });
  if (values.isDefault) await makeDefaultTaxRate(savedId!, values.appliesTo);
  revalidateAll();
  return okState(id ? "Tax rate updated" : "Tax rate added");
}

export async function setDefaultTaxRate(fd: FormData) {
  await requirePermission("settings.manage");
  const [t] = await db.select().from(schema.taxRates).where(eq(schema.taxRates.id, s(fd, "id")));
  if (t) await makeDefaultTaxRate(t.id, t.appliesTo);
  revalidateAll();
}

export async function deleteTaxRate(_p: ActionState, fd: FormData): Promise<ActionState> {
  const denial = await denied("settings.manage");
  if (denial) return errState(denial);
  const id = s(fd, "id");
  const [t] = await db.select().from(schema.taxRates).where(eq(schema.taxRates.id, id));
  if (!t) return errState("That tax rate no longer exists.");
  if (t.isDefault) return errState("Make another rate the default before deleting this one.");
  const used = await db.select({ id: schema.estimates.id }).from(schema.estimates).where(eq(schema.estimates.taxRateId, id)).limit(1);
  if (used.length) return errState(`${t.code} is used by estimates — deactivate it instead.`);
  await db.delete(schema.taxRates).where(eq(schema.taxRates.id, id));
  revalidateAll();
  return okState("Tax rate deleted");
}

/* ───────────────────────── Numbering ───────────────────────── */

export async function saveNumbering(_p: ActionState, fd: FormData): Promise<ActionState> {
  const denial = await denied("settings.manage");
  if (denial) return errState(denial);
  const r = numberingSchema.safeParse(formToObject(fd));
  if (!r.success) return errState(FIX, issuesToFieldErrors(r.error.issues));
  const v = r.data;
  const [est, jobs, inv, po, vars] = await Promise.all([
    db.select({ n: schema.estimates.number }).from(schema.estimates),
    db.select({ n: schema.jobs.number }).from(schema.jobs),
    db.select({ n: schema.invoices.number }).from(schema.invoices),
    db.select({ n: schema.purchaseOrders.number }).from(schema.purchaseOrders),
    db.select({ n: schema.variations.number }).from(schema.variations),
  ]);
  const existing: Record<string, string[]> = { estimate: est.map((x) => x.n), job: jobs.map((x) => x.n), invoice: inv.map((x) => x.n), order: po.map((x) => x.n), variation: vars.map((x) => x.n) };
  const fieldErrors: Record<string, string> = {};
  for (const k of NUMBERING_KINDS) {
    const cap = k.key[0].toUpperCase() + k.key.slice(1);
    const prefix = v[`${k.key}NumberPrefix` as keyof typeof v] as string;
    const next = v[`next${cap}Number` as keyof typeof v] as number;
    const safe = minSafeNext(prefix, existing[k.key]);
    if (next < safe) fieldErrors[`next${cap}Number`] = `${prefix}${next} would clash with existing numbers — use ${safe} or higher`;
  }
  if (Object.keys(fieldErrors).length) return errState(FIX, fieldErrors);
  const cur = await getSettings();
  await db.update(schema.businessSettings).set(v).where(eq(schema.businessSettings.id, cur.id));
  revalidateAll();
  return okState("Numbering saved");
}

/* ───────────────────────── Quote defaults ───────────────────────── */

export async function saveQuoteDefaults(_p: ActionState, fd: FormData): Promise<ActionState> {
  const denial = await denied("settings.manage");
  if (denial) return errState(denial);
  const r = quoteDefaultsSchema.safeParse(formToObject(fd));
  if (!r.success) return errState(FIX, issuesToFieldErrors(r.error.issues));
  const cur = await getSettings();
  if (r.data.defaultTaxRateId) {
    const [t] = await db.select().from(schema.taxRates).where(eq(schema.taxRates.id, r.data.defaultTaxRateId));
    if (!t || t.appliesTo !== "income") return errState(FIX, { defaultTaxRateId: "Choose an income tax rate" });
    await makeDefaultTaxRate(t.id, "income");
  }
  await db.update(schema.businessSettings).set(r.data).where(eq(schema.businessSettings.id, cur.id));
  revalidateAll();
  return okState("Quote defaults saved");
}

/* ───────────────────────── Display preferences ───────────────────────── */

export async function saveDisplay(_p: ActionState, fd: FormData): Promise<ActionState> {
  const denial = await denied("settings.manage");
  if (denial) return errState(denial);
  const cur = await getSettings();
  await db
    .update(schema.businessSettings)
    .set({ showDashboardQuickStart: fd.get("showDashboardQuickStart") === "on", showDashboardEstimateSummary: fd.get("showDashboardEstimateSummary") === "on" })
    .where(eq(schema.businessSettings.id, cur.id));
  revalidatePath("/dashboard");
  revalidatePath("/settings/display");
  return okState("Display preferences saved");
}

/* ───────────────────────── Lists (lookups) ───────────────────────── */

const KIND_RE = /^[a-z][a-z0-9_]{1,40}$/;

async function kindRows(kind: string) {
  return db.select().from(schema.lookups).where(eq(schema.lookups.kind, kind)).orderBy(asc(schema.lookups.sortOrder), asc(schema.lookups.name));
}

function revalidateLists(kind: string) {
  revalidatePath("/settings/lists");
  revalidatePath(`/settings/lists/${kind}`);
  revalidatePath("/", "layout");
}

export async function addLookup(_p: ActionState, fd: FormData): Promise<ActionState> {
  const denial = await denied("settings.manage");
  if (denial) return errState(denial);
  const kind = s(fd, "kind");
  if (!KIND_RE.test(kind)) return errState("Unknown list.");
  const name = lookupNameSchema.safeParse(fd.get("name") ?? "");
  if (!name.success) return errState(FIX, { name: name.error.issues[0].message });
  const rows = await kindRows(kind);
  if (isDuplicateName(rows, name.data)) return errState(FIX, { name: `"${name.data}" is already in this list` });
  const sortOrder = rows.reduce((m, r) => Math.max(m, r.sortOrder), 0) + 1;
  await db.insert(schema.lookups).values({ kind, name: name.data, sortOrder, isSystem: false, flag: false });
  revalidateLists(kind);
  return okState(`Added "${name.data}"`);
}

/** Existing records store the lookup *name*; keep them in step when a value is renamed. */
async function cascadeRename(kind: string, from: string, to: string) {
  const t = schema;
  switch (kind) {
    case "estimate_status":
      await db.update(t.estimates).set({ status: to }).where(eq(t.estimates.status, from));
      break;
    case "building_type":
      await db.update(t.estimates).set({ buildingType: to }).where(eq(t.estimates.buildingType, from));
      await db.update(t.leads).set({ buildingType: to }).where(eq(t.leads.buildingType, from));
      break;
    case "contact_type":
      await db.update(t.contacts).set({ contactType: to }).where(eq(t.contacts.contactType, from));
      break;
    case "client_source":
      await db.update(t.clients).set({ source: to }).where(eq(t.clients.source, from));
      await db.update(t.leads).set({ source: to }).where(eq(t.leads.source, from));
      await db.update(t.estimates).set({ source: to }).where(eq(t.estimates.source, from));
      break;
    case "client_type":
      await db.update(t.clients).set({ category: to }).where(eq(t.clients.category, from));
      break;
    case "document_folder":
      await db.update(t.documents).set({ folder: to }).where(eq(t.documents.folder, from));
      break;
    case "unit_measure":
      await db.update(t.estimateItems).set({ uom: to }).where(eq(t.estimateItems.uom, from));
      await db.update(t.catalogueItems).set({ uom: to }).where(eq(t.catalogueItems.uom, from));
      break;
  }
}

export async function renameLookup(_p: ActionState, fd: FormData): Promise<ActionState> {
  const denial = await denied("settings.manage");
  if (denial) return errState(denial);
  const id = s(fd, "id");
  const [row] = await db.select().from(schema.lookups).where(eq(schema.lookups.id, id));
  if (!row) return errState("That value no longer exists.");
  const name = lookupNameSchema.safeParse(fd.get("name") ?? "");
  if (!name.success) return errState(name.error.issues[0].message);
  if (name.data === row.name) return okState("No changes");
  const rows = await kindRows(row.kind);
  if (isDuplicateName(rows, name.data, id)) return errState(`"${name.data}" is already in this list`);
  await db.update(schema.lookups).set({ name: name.data }).where(eq(schema.lookups.id, id));
  await cascadeRename(row.kind, row.name, name.data);
  revalidateLists(row.kind);
  return okState("Renamed");
}

export async function moveLookup(fd: FormData) {
  await requirePermission("settings.manage");
  const id = s(fd, "id");
  const dir = s(fd, "dir") === "up" ? "up" : "down";
  const [row] = await db.select().from(schema.lookups).where(eq(schema.lookups.id, id));
  if (!row) return;
  const rows = await kindRows(row.kind);
  const order = moveInOrder(rows.map((r) => r.id), id, dir);
  // Renumber 1..n so ties from older data can't stall the move.
  await Promise.all(order.map((rid, i) => db.update(schema.lookups).set({ sortOrder: i + 1 }).where(eq(schema.lookups.id, rid))));
  revalidateLists(row.kind);
}

export async function toggleLookupActive(fd: FormData) {
  await requirePermission("settings.manage");
  const [row] = await db.select().from(schema.lookups).where(eq(schema.lookups.id, s(fd, "id")));
  if (!row) return;
  if (row.active && row.flag) return; // the accepted status must stay active
  await db.update(schema.lookups).set({ active: !row.active }).where(eq(schema.lookups.id, row.id));
  revalidateLists(row.kind);
}

export async function setAcceptedStatus(fd: FormData) {
  await requirePermission("settings.manage");
  const [row] = await db.select().from(schema.lookups).where(eq(schema.lookups.id, s(fd, "id")));
  if (!row || row.kind !== "estimate_status") return;
  await db.update(schema.lookups).set({ flag: false }).where(eq(schema.lookups.kind, "estimate_status"));
  await db.update(schema.lookups).set({ flag: true, active: true }).where(eq(schema.lookups.id, row.id));
  revalidateLists(row.kind);
}

export async function deleteLookup(_p: ActionState, fd: FormData): Promise<ActionState> {
  const denial = await denied("settings.manage");
  if (denial) return errState(denial);
  const [row] = await db.select().from(schema.lookups).where(eq(schema.lookups.id, s(fd, "id")));
  if (!row) return errState("That value no longer exists.");
  if (row.isSystem) return errState("Built-in values can't be deleted — deactivate it instead.");
  if (row.flag) return errState("Choose another accepted status first.");
  await db.delete(schema.lookups).where(eq(schema.lookups.id, row.id));
  revalidateLists(row.kind);
  return okState("Deleted");
}
