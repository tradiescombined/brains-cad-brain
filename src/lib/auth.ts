import "server-only";
import { db, schema } from "@/db";
import { and, asc, eq } from "drizzle-orm";

export type AppUser = typeof schema.users.$inferSelect;

/**
 * The signed-in team member (a row in `users`), or null when nobody is signed in.
 * CONTRACT shared by all modules — keep this signature stable.
 *
 * Current implementation (pre-auth placeholder): returns the first active Owner, so the
 * app behaves as single-user. The sign-in integration replaces the body to resolve the
 * real session user.
 */
export async function getCurrentUser(): Promise<AppUser | null> {
  const [owner] = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.role, "Owner"), eq(schema.users.active, true)))
    .orderBy(asc(schema.users.createdAt))
    .limit(1);
  return owner ?? null;
}
