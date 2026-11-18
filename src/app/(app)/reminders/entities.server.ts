import "server-only";
import { db, schema } from "@/db";
import { desc, eq, inArray } from "drizzle-orm";

export type EntityOption = { type: string; id: string; label: string };

/** Records that can be linked from a reminder, newest first (read-only queries on other modules' tables). */
export async function listEntityOptions(): Promise<EntityOption[]> {
  const [est, jobs, leads, clients, contacts, invoices] = await Promise.all([
    db.select({ id: schema.estimates.id, number: schema.estimates.number, name: schema.estimates.name }).from(schema.estimates).where(eq(schema.estimates.archived, false)).orderBy(desc(schema.estimates.updatedAt)).limit(200),
    db.select({ id: schema.jobs.id, number: schema.jobs.number, name: schema.jobs.name }).from(schema.jobs).where(eq(schema.jobs.archived, false)).orderBy(desc(schema.jobs.updatedAt)).limit(200),
    db.select({ id: schema.leads.id, number: schema.leads.number, name: schema.leads.title }).from(schema.leads).where(eq(schema.leads.archived, false)).orderBy(desc(schema.leads.updatedAt)).limit(200),
    db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).where(eq(schema.clients.archived, false)).orderBy(schema.clients.name).limit(300),
    db.select({ id: schema.contacts.id, name: schema.contacts.name }).from(schema.contacts).where(eq(schema.contacts.archived, false)).orderBy(schema.contacts.name).limit(300),
    db.select({ id: schema.invoices.id, number: schema.invoices.number }).from(schema.invoices).orderBy(desc(schema.invoices.issueDate)).limit(200),
  ]);
  const withNo = (n: string | null, name: string) => (n ? `${n} · ${name}` : name);
  return [
    ...est.map((r) => ({ type: "estimate", id: r.id, label: withNo(r.number, r.name) })),
    ...jobs.map((r) => ({ type: "job", id: r.id, label: withNo(r.number, r.name) })),
    ...leads.map((r) => ({ type: "lead", id: r.id, label: withNo(r.number, r.name) })),
    ...clients.map((r) => ({ type: "client", id: r.id, label: r.name })),
    ...contacts.map((r) => ({ type: "contact", id: r.id, label: r.name })),
    ...invoices.map((r) => ({ type: "invoice", id: r.id, label: r.number })),
  ];
}

/** Resolve display labels for a set of (type, id) refs. Returns map keyed "type:id". */
export async function resolveEntityLabels(refs: { entityType: string | null; entityId: string | null }[]) {
  const ids: Record<string, Set<string>> = {};
  for (const r of refs) if (r.entityType && r.entityId) (ids[r.entityType] ??= new Set()).add(r.entityId);
  const out = new Map<string, string>();
  const list = (t: string) => [...(ids[t] ?? [])];
  const put = (t: string, rows: { id: string; label: string }[]) => rows.forEach((r) => out.set(`${t}:${r.id}`, r.label));
  const jobs: Promise<void>[] = [];
  if (list("estimate").length)
    jobs.push(db.select({ id: schema.estimates.id, n: schema.estimates.number, name: schema.estimates.name }).from(schema.estimates).where(inArray(schema.estimates.id, list("estimate"))).then((r) => put("estimate", r.map((x) => ({ id: x.id, label: `${x.n} · ${x.name}` })))));
  if (list("job").length)
    jobs.push(db.select({ id: schema.jobs.id, n: schema.jobs.number, name: schema.jobs.name }).from(schema.jobs).where(inArray(schema.jobs.id, list("job"))).then((r) => put("job", r.map((x) => ({ id: x.id, label: `${x.n} · ${x.name}` })))));
  if (list("lead").length)
    jobs.push(db.select({ id: schema.leads.id, name: schema.leads.title }).from(schema.leads).where(inArray(schema.leads.id, list("lead"))).then((r) => put("lead", r.map((x) => ({ id: x.id, label: x.name })))));
  if (list("client").length)
    jobs.push(db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).where(inArray(schema.clients.id, list("client"))).then((r) => put("client", r.map((x) => ({ id: x.id, label: x.name })))));
  if (list("contact").length)
    jobs.push(db.select({ id: schema.contacts.id, name: schema.contacts.name }).from(schema.contacts).where(inArray(schema.contacts.id, list("contact"))).then((r) => put("contact", r.map((x) => ({ id: x.id, label: x.name })))));
  if (list("invoice").length)
    jobs.push(db.select({ id: schema.invoices.id, n: schema.invoices.number }).from(schema.invoices).where(inArray(schema.invoices.id, list("invoice"))).then((r) => put("invoice", r.map((x) => ({ id: x.id, label: x.n })))));
  await Promise.all(jobs);
  return out;
}
