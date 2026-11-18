import "server-only";
import { db, schema } from "@/db";
import { eq, and, asc } from "drizzle-orm";

export type Settings = typeof schema.businessSettings.$inferSelect;

/** Returns the single settings row, creating it on first use. */
export async function getSettings(): Promise<Settings> {
  const rows = await db.select().from(schema.businessSettings).limit(1);
  if (rows[0]) return rows[0];
  const [row] = await db.insert(schema.businessSettings).values({}).returning();
  return row;
}

type CounterField = "Estimate" | "Job" | "Invoice" | "Order" | "Variation";

/** Allocates the next document number, e.g. "Q1000", and increments the counter. */
export async function nextNumber(kind: CounterField): Promise<string> {
  const s = await getSettings();
  const prefix = s[`${lower(kind)}NumberPrefix` as keyof Settings] as string;
  const n = s[`next${kind}Number` as keyof Settings] as number;
  await db
    .update(schema.businessSettings)
    .set({ [`next${kind}Number`]: n + 1 } as Partial<Settings>)
    .where(eq(schema.businessSettings.id, s.id));
  return `${prefix}${n}`;
}
function lower(k: string) {
  return k[0].toLowerCase() + k.slice(1);
}

/** Active lookup values of a kind, ordered. */
export async function getLookups(kind: string) {
  return db
    .select()
    .from(schema.lookups)
    .where(and(eq(schema.lookups.kind, kind), eq(schema.lookups.active, true)))
    .orderBy(asc(schema.lookups.sortOrder), asc(schema.lookups.name));
}

export async function getTaxRates() {
  return db.select().from(schema.taxRates).where(eq(schema.taxRates.active, true));
}

export async function getDefaultTaxRate() {
  const all = await db.select().from(schema.taxRates);
  return all.find((t) => t.isDefault && t.appliesTo === "income") ?? all[0] ?? { id: "", code: "NONE", name: "No tax", rate: 0 };
}

/** Records an activity-feed entry. */
export async function logActivity(entityType: string, entityId: string, action: string, summary: string) {
  await db.insert(schema.activity).values({ entityType, entityId, action, summary });
}
