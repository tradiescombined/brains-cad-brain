import "server-only";
import { db, schema } from "@/db";
import { count, eq } from "drizzle-orm";

/** Counts records that would be orphaned by deleting a client. */
export async function clientReferences(id: string) {
  const [[e], [j], [l]] = await Promise.all([
    db.select({ n: count() }).from(schema.estimates).where(eq(schema.estimates.clientId, id)),
    db.select({ n: count() }).from(schema.jobs).where(eq(schema.jobs.clientId, id)),
    db.select({ n: count() }).from(schema.leads).where(eq(schema.leads.clientId, id)),
  ]);
  return { estimates: e.n, jobs: j.n, leads: l.n };
}
