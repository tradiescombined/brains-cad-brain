import "server-only";
import { cache } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db, schema } from "@/db";
import { and, asc, eq } from "drizzle-orm";
import { authBypassEnabled } from "@/lib/auth-bypass";
import { providerName, resolveUser, type ClerkIdentity } from "@/lib/user-resolution";

export type AppUser = typeof schema.users.$inferSelect;

export type AccessStatus =
  | { status: "ok"; user: AppUser }
  | { status: "signed-out" }
  | { status: "inactive"; email: string | null; user: AppUser }
  | { status: "unknown"; email: string | null };

async function firstActiveOwner(): Promise<AppUser | null> {
  const [owner] = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.role, "Owner"), eq(schema.users.active, true)))
    .orderBy(asc(schema.users.createdAt))
    .limit(1);
  return owner ?? null;
}

async function clerkIdentity(clerkUserId: string): Promise<ClerkIdentity> {
  const cu = await currentUser();
  const primary = cu?.primaryEmailAddress ?? null;
  const email = primary?.emailAddress ?? null;
  const ext =
    cu?.externalAccounts.find((a) => a.emailAddress?.toLowerCase() === email?.toLowerCase()) ?? cu?.externalAccounts[0];
  return {
    clerkUserId,
    email,
    emailVerified: primary?.verification?.status === "verified",
    firstName: cu?.firstName ?? null,
    lastName: cu?.lastName ?? null,
    provider: providerName(ext?.provider) ?? (email ? "email" : null),
  };
}

/**
 * Resolves the Clerk session to a `users` row, linking the row on first sign-in (see
 * `src/lib/user-resolution.ts` for the policy). Memoised per request.
 */
export const getAccessStatus = cache(async (): Promise<AccessStatus> => {
  if (authBypassEnabled()) {
    const owner = await firstActiveOwner();
    return owner ? { status: "ok", user: owner } : { status: "unknown", email: null };
  }

  const { userId } = await auth();
  if (!userId) return { status: "signed-out" };

  // Fast path: already linked — no Clerk API call needed.
  const [linked] = await db.select().from(schema.users).where(eq(schema.users.clerkUserId, userId)).limit(1);
  if (linked) return linked.active ? { status: "ok", user: linked } : { status: "inactive", email: linked.email, user: linked };

  const identity = await clerkIdentity(userId);
  const rows = await db.select().from(schema.users);
  const r = resolveUser(identity, rows, { ownerEmail: process.env.BCB_OWNER_EMAIL });
  switch (r.kind) {
    case "ok":
      return { status: "ok", user: r.user };
    case "inactive":
      return { status: "inactive", email: r.email, user: r.user };
    case "unknown":
      return { status: "unknown", email: r.email };
    case "link": {
      const [user] = await db.update(schema.users).set(r.updates).where(eq(schema.users.id, r.user.id)).returning();
      return { status: "ok", user };
    }
    case "createOwner": {
      try {
        const [user] = await db.insert(schema.users).values(r.values).returning();
        return { status: "ok", user };
      } catch {
        // A concurrent request linked this Clerk user first (unique clerk_user_id).
        const [user] = await db.select().from(schema.users).where(eq(schema.users.clerkUserId, userId)).limit(1);
        return user ? { status: "ok", user } : { status: "unknown", email: identity.email };
      }
    }
  }
});

/**
 * The signed-in team member (a row in `users`), or null when nobody is signed in (or the signed-in
 * person has no active team member record).
 * CONTRACT shared by all modules — keep this signature stable.
 *
 * With `BCB_AUTH_BYPASS=1` (tests only, never on a deployed site) returns the first active Owner.
 */
export async function getCurrentUser(): Promise<AppUser | null> {
  const a = await getAccessStatus();
  return a.status === "ok" ? a.user : null;
}
