import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, type AppUser } from "@/lib/auth";

/**
 * Role-based permissions. The matrix + `can()` are pure (unit tested in permissions.test.ts);
 * the async helpers below resolve the signed-in user via `getCurrentUser()` and are the
 * server-side security boundary for every Server Action and gated page.
 * Matrix rationale: docs/PERMISSIONS.md.
 */

export const ROLES = ["Owner", "Admin", "Estimator", "Project Manager", "Site Supervisor", "Read Only"] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS = [
  "settings.manage",
  "users.manage",
  "estimates.view",
  "estimates.edit",
  "estimates.delete",
  "quotes.send",
  "catalogues.edit",
  "leads.edit",
  "clients.edit",
  "contacts.edit",
  "jobs.view",
  "jobs.edit",
  "schedule.edit",
  "orders.view",
  "orders.edit",
  "variations.edit",
  "variations.approve",
  "invoices.view",
  "invoices.edit",
  "invoices.payments",
  "costs.view",
  "timesheets.edit",
  "selections.edit",
  "notes.edit",
  "reminders.edit",
  "records.delete",
] as const;
export type Action = (typeof ACTIONS)[number];

/** Human wording used in "You don't have permission to …" messages. */
export const ACTION_LABELS: Record<Action, string> = {
  "settings.manage": "change settings",
  "users.manage": "manage users",
  "estimates.view": "view estimates",
  "estimates.edit": "edit estimates",
  "estimates.delete": "delete estimates",
  "quotes.send": "send quotes",
  "catalogues.edit": "edit catalogues",
  "leads.edit": "edit leads",
  "clients.edit": "edit clients",
  "contacts.edit": "edit suppliers and trades",
  "jobs.view": "view jobs",
  "jobs.edit": "edit jobs",
  "schedule.edit": "edit the schedule",
  "orders.view": "view purchase orders",
  "orders.edit": "edit purchase orders",
  "variations.edit": "edit variations",
  "variations.approve": "approve variations",
  "invoices.view": "view invoices",
  "invoices.edit": "edit invoices",
  "invoices.payments": "record payments",
  "costs.view": "view costs and margins",
  "timesheets.edit": "edit timesheets",
  "selections.edit": "edit selections",
  "notes.edit": "add notes and files",
  "reminders.edit": "edit reminders",
  "records.delete": "delete records",
};

const ALL = new Set<Action>(ACTIONS);

export const PERMISSIONS: Record<Role, ReadonlySet<Action>> = {
  Owner: ALL,
  // Everything; the Owner-protection rules (can't delete/demote an Owner or grant Owner)
  // live in the Settings → Users actions via `canManageUser`.
  Admin: ALL,
  Estimator: new Set<Action>([
    "estimates.view", "estimates.edit", "estimates.delete", "quotes.send", "catalogues.edit",
    "leads.edit", "clients.edit", "contacts.edit", "jobs.view", "costs.view",
    "notes.edit", "reminders.edit",
  ]),
  "Project Manager": new Set<Action>([
    "estimates.view", "contacts.edit", "jobs.view", "jobs.edit", "schedule.edit",
    "orders.view", "orders.edit", "variations.edit", "variations.approve", "invoices.view",
    "costs.view", "timesheets.edit", "selections.edit", "notes.edit", "reminders.edit",
  ]),
  "Site Supervisor": new Set<Action>([
    "jobs.view", "schedule.edit", "timesheets.edit", "selections.edit", "notes.edit", "reminders.edit",
  ]),
  "Read Only": new Set<Action>(["estimates.view", "jobs.view", "invoices.view"]),
};

export function isRole(x: unknown): x is Role {
  return typeof x === "string" && (ROLES as readonly string[]).includes(x);
}

/** Pure check. Unknown/missing role → no permissions. */
export function can(role: string | null | undefined, action: Action): boolean {
  return isRole(role) && PERMISSIONS[role].has(action);
}

export function deniedMessage(action: Action): string {
  return `You don't have permission to ${ACTION_LABELS[action]}.`;
}
export const SIGN_IN_MESSAGE = "Please sign in to continue.";

/**
 * Owner protection for Settings → Users (pure).
 * Only an Owner may create, edit or delete an Owner, or give someone the Owner role.
 * Returns an error message, or null when allowed.
 */
export function canManageUser(
  actorRole: string | null | undefined,
  target: { role: string } | null,
  nextRole?: string | null,
): string | null {
  if (!can(actorRole, "users.manage")) return deniedMessage("users.manage");
  if (actorRole === "Owner") return null;
  if (target?.role === "Owner") return "Only an Owner can change or remove an Owner.";
  if (nextRole === "Owner") return "Only an Owner can give someone the Owner role.";
  return null;
}

/** Last-active-Owner guard (pure). `otherActiveOwners` excludes the target user. */
export function lastOwnerError(
  target: { role: string; active: boolean },
  next: { role: string; active: boolean } | null,
  otherActiveOwners: number,
): string | null {
  const isActiveOwner = target.role === "Owner" && target.active;
  const staysActiveOwner = !!next && next.role === "Owner" && next.active;
  if (isActiveOwner && !staysActiveOwner && otherActiveOwners === 0) {
    return next ? "There must be at least one active Owner." : "You can't delete the only active Owner.";
  }
  return null;
}

/* ───────────────────────── Server helpers ───────────────────────── */

/** One user lookup per request render (React cache is a no-op outside a render, e.g. in actions). */
const currentUser = cache(() => getCurrentUser());

export class PermissionError extends Error {
  readonly action: Action | null;
  constructor(action: Action | null) {
    super(action ? deniedMessage(action) : SIGN_IN_MESSAGE);
    this.name = "PermissionError";
    this.action = action;
  }
}

export type PermissionCheck = { ok: true; user: AppUser } | { ok: false; user: AppUser | null; error: string };

/** Non-throwing check for Server Actions that return an error state. */
export async function checkPermission(action: Action): Promise<PermissionCheck> {
  const user = await currentUser();
  if (!user || !user.active) return { ok: false, user: null, error: SIGN_IN_MESSAGE };
  if (!can(user.role, action)) return { ok: false, user, error: deniedMessage(action) };
  return { ok: true, user };
}

/** Error message when the current user may NOT do `action`, else null. */
export async function denied(action: Action): Promise<string | null> {
  const r = await checkPermission(action);
  return r.ok ? null : r.error;
}

export function forbiddenUrl(action: Action | null): string {
  return action ? `/forbidden?need=${encodeURIComponent(action)}` : "/no-access";
}

/**
 * Gate a page or a void Server Action (form action with no result state).
 * Denied → redirect to /forbidden, which renders a friendly 403 / sign-in card.
 */
export async function requirePermission(action: Action): Promise<AppUser> {
  const r = await checkPermission(action);
  if (!r.ok) redirect(forbiddenUrl(r.user ? action : null));
  return r.user;
}

/** Like requirePermission but throws a typed PermissionError (for callers that catch). */
export async function assertPermission(action: Action): Promise<AppUser> {
  const r = await checkPermission(action);
  if (!r.ok) throw new PermissionError(r.user ? action : null);
  return r.user;
}

/** Any active signed-in user (read-only Server Actions / pages with no specific gate). */
export async function requireUser(): Promise<AppUser> {
  const user = await currentUser();
  if (!user || !user.active) redirect(forbiddenUrl(null));
  return user;
}

export type Permissions = { user: AppUser | null; role: Role | null } & Record<Action, boolean>;

/** All flags for the current user, for hiding/disabling UI. */
export async function currentPermissions(): Promise<Permissions> {
  const user = await currentUser();
  const role = user && user.active && isRole(user.role) ? user.role : null;
  const flags = Object.fromEntries(ACTIONS.map((a) => [a, can(role, a)])) as Record<Action, boolean>;
  return { user: role ? user : null, role, ...flags };
}

/** For Route Handlers: a 401/403 Response when not allowed, else null. `action` null = any signed-in user. */
export async function routeDenied(action: Action | null): Promise<Response | null> {
  const user = await currentUser();
  if (!user || !user.active) return new Response(SIGN_IN_MESSAGE, { status: 401 });
  if (action && !can(user.role, action)) return new Response(deniedMessage(action), { status: 403 });
  return null;
}
