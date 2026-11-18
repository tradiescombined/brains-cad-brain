import "server-only";
import { db, schema } from "@/db";
import { asc, eq } from "drizzle-orm";
import { getLookups } from "@/lib/settings";
import type { ClientOption } from "./LeadForm";

export const userName = (u: { firstName: string; surname: string | null }) => [u.firstName, u.surname].filter(Boolean).join(" ");

export async function getUsers() {
  const rows = await db.select().from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.firstName));
  return rows.map((u) => ({ id: u.id, name: userName(u) }));
}

/** Everything the lead form needs for its selects. */
export async function getLeadFormOptions() {
  const [sources, buildingTypes, clients, users] = await Promise.all([
    getLookups("client_source"),
    getLookups("building_type"),
    db
      .select({
        id: schema.clients.id,
        name: schema.clients.name,
        email: schema.clients.email,
        phone: schema.clients.phone,
        mobile: schema.clients.mobile,
        address: schema.clients.address,
        cityTown: schema.clients.cityTown,
        state: schema.clients.state,
        postcode: schema.clients.postcode,
      })
      .from(schema.clients)
      .where(eq(schema.clients.archived, false))
      .orderBy(asc(schema.clients.name)),
    getUsers(),
  ]);
  return {
    sources: sources.map((s) => s.name),
    buildingTypes: buildingTypes.map((s) => s.name),
    clients: clients as ClientOption[],
    users,
  };
}
