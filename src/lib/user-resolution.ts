/**
 * Pure sign-in → team member resolution (no DB, no Clerk calls), so it can be unit tested.
 * `src/lib/auth.ts` feeds it the Clerk identity and the `users` rows, then applies the outcome.
 *
 * Policy (invite-only):
 *  1. A row already linked to this Clerk user id → that user (or "inactive").
 *  2. Else a row whose email matches the verified Clerk email (case-insensitive) → link it.
 *  3. Else, on a fresh install (no row has a Clerk id yet) the first person to sign in becomes the Owner:
 *     they claim the seeded placeholder Owner (owner@example.com), or a new Owner row is created when
 *     there is no active Owner at all. `ownerEmail` (env BCB_OWNER_EMAIL) restricts who may do this.
 *  4. Anyone else → "unknown": the Owner must add their email in Settings → Users first.
 */

export const PLACEHOLDER_OWNER_EMAIL = "owner@example.com";

export type Role = "Owner" | "Admin" | "Estimator" | "Project Manager" | "Site Supervisor" | "Read Only";

export type UserRowLike = {
  id: string;
  firstName: string;
  surname: string | null;
  email: string;
  role: Role;
  active: boolean;
  clerkUserId: string | null;
  createdAt: string;
};

export type ClerkIdentity = {
  clerkUserId: string;
  /** Primary email address (null if the Clerk user has none). */
  email: string | null;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  /** "google" | "apple" | "email" ... */
  provider: string | null;
};

export type LinkUpdates = {
  clerkUserId: string;
  email: string;
  firstName?: string;
  surname?: string | null;
  signInProvider: string | null;
  linkedAt: string;
};

export type Resolution<U extends UserRowLike = UserRowLike> =
  | { kind: "ok"; user: U }
  | { kind: "link"; user: U; updates: LinkUpdates }
  | { kind: "createOwner"; values: LinkUpdates & { firstName: string; role: "Owner"; active: true } }
  | { kind: "inactive"; user: U; email: string | null }
  | { kind: "unknown"; email: string | null };

const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

function linkUpdates(id: ClerkIdentity, email: string, now: string): LinkUpdates {
  const u: LinkUpdates = { clerkUserId: id.clerkUserId, email, signInProvider: id.provider, linkedAt: now };
  const first = id.firstName?.trim();
  const last = id.lastName?.trim();
  if (first) u.firstName = first;
  if (first || last) u.surname = last || null;
  return u;
}

export function resolveUser<U extends UserRowLike>(
  identity: ClerkIdentity,
  rows: U[],
  opts: { now?: string; ownerEmail?: string | null } = {},
): Resolution<U> {
  const now = opts.now ?? new Date().toISOString();

  const linked = rows.find((r) => r.clerkUserId === identity.clerkUserId);
  if (linked) return linked.active ? { kind: "ok", user: linked } : { kind: "inactive", user: linked, email: identity.email };

  // Only trust a verified email for matching/claiming (Google/Apple emails are verified by Clerk).
  const email = identity.emailVerified ? norm(identity.email) : "";
  if (!email) return { kind: "unknown", email: identity.email };

  const byEmail = rows.find((r) => norm(r.email) === email);
  if (byEmail) {
    if (!byEmail.active) return { kind: "inactive", user: byEmail, email };
    return { kind: "link", user: byEmail, updates: linkUpdates(identity, email, now) };
  }

  const freshInstall = !rows.some((r) => r.clerkUserId);
  const ownerEmail = norm(opts.ownerEmail);
  if (freshInstall && (!ownerEmail || ownerEmail === email)) {
    const placeholder = rows
      .filter((r) => r.role === "Owner" && r.active && norm(r.email) === PLACEHOLDER_OWNER_EMAIL)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (placeholder) return { kind: "link", user: placeholder, updates: linkUpdates(identity, email, now) };
    if (!rows.some((r) => r.role === "Owner" && r.active)) {
      const u = linkUpdates(identity, email, now);
      return {
        kind: "createOwner",
        values: { ...u, firstName: u.firstName ?? email.split("@")[0], role: "Owner", active: true },
      };
    }
  }

  return { kind: "unknown", email };
}

/** Clerk external account provider ("oauth_google") → "google". */
export function providerName(p: string | null | undefined): string | null {
  if (!p) return null;
  return p.replace(/^oauth_/, "");
}

/** "google" → "Google" for display. */
export function providerLabel(p: string | null | undefined): string {
  if (!p) return "email";
  const map: Record<string, string> = { google: "Google", apple: "Apple", email: "email", microsoft: "Microsoft" };
  return map[p] ?? p.charAt(0).toUpperCase() + p.slice(1);
}
