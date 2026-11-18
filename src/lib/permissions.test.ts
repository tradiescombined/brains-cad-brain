import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const getCurrentUser = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import {
  ACTIONS, ACTION_LABELS, PERMISSIONS, ROLES, PermissionError, assertPermission, can, canManageUser, checkPermission,
  currentPermissions, denied, lastOwnerError, requirePermission, requireUser, routeDenied, type Action, type Role,
} from "./permissions";

const user = (role: string, active = true) => ({ id: "u1", firstName: "Sam", surname: null, email: "sam@x.test", mobile: null, role, active, createdAt: "", updatedAt: "" });

describe("permission matrix", () => {
  it("every action has a label and every role a row", () => {
    for (const a of ACTIONS) expect(ACTION_LABELS[a]).toBeTruthy();
    for (const r of ROLES) expect(PERMISSIONS[r]).toBeDefined();
  });

  it("Owner and Admin can do everything", () => {
    for (const a of ACTIONS) {
      expect(can("Owner", a)).toBe(true);
      expect(can("Admin", a)).toBe(true);
    }
  });

  it("unknown or missing roles can do nothing", () => {
    for (const a of ACTIONS) {
      expect(can(null, a)).toBe(false);
      expect(can(undefined, a)).toBe(false);
      expect(can("Superuser", a)).toBe(false);
    }
  });

  const expectOnly = (role: Role, allowed: Action[]) => {
    for (const a of ACTIONS) expect([a, can(role, a)]).toEqual([a, allowed.includes(a)]);
  };

  it("Estimator: leads, clients, estimates, quotes, catalogues — no job money or settings", () => {
    expectOnly("Estimator", [
      "estimates.view", "estimates.edit", "estimates.delete", "quotes.send", "catalogues.edit", "leads.edit",
      "clients.edit", "contacts.edit", "jobs.view", "costs.view", "notes.edit", "reminders.edit",
    ]);
  });

  it("Project Manager: view estimates, run jobs, invoices view-only", () => {
    expectOnly("Project Manager", [
      "estimates.view", "contacts.edit", "jobs.view", "jobs.edit", "schedule.edit", "orders.view", "orders.edit",
      "variations.edit", "variations.approve", "invoices.view", "costs.view", "timesheets.edit", "selections.edit",
      "notes.edit", "reminders.edit",
    ]);
    expect(can("Project Manager", "invoices.edit")).toBe(false);
    expect(can("Project Manager", "invoices.payments")).toBe(false);
  });

  it("Site Supervisor: schedule, timesheets, selections, notes — no money", () => {
    expectOnly("Site Supervisor", ["jobs.view", "schedule.edit", "timesheets.edit", "selections.edit", "notes.edit", "reminders.edit"]);
    for (const a of ["costs.view", "invoices.view", "orders.view"] as Action[]) expect(can("Site Supervisor", a)).toBe(false);
  });

  it("Read Only: views but no edits and no costs", () => {
    expectOnly("Read Only", ["estimates.view", "jobs.view", "invoices.view"]);
    for (const a of ACTIONS) if (!a.endsWith(".view")) expect(can("Read Only", a)).toBe(false);
  });
});

describe("Owner protection (pure guards)", () => {
  it("only Owners may touch Owner rows or grant the Owner role", () => {
    expect(canManageUser("Owner", { role: "Owner" }, "Admin")).toBeNull();
    expect(canManageUser("Owner", null, "Owner")).toBeNull();
    expect(canManageUser("Admin", { role: "Estimator" }, "Project Manager")).toBeNull();
    expect(canManageUser("Admin", { role: "Owner" }, "Owner")).toMatch(/Only an Owner/);
    expect(canManageUser("Admin", { role: "Owner" })).toMatch(/Only an Owner/);
    expect(canManageUser("Admin", null, "Owner")).toMatch(/Owner role/);
    expect(canManageUser("Estimator", { role: "Read Only" }, "Read Only")).toMatch(/permission to manage users/);
  });

  it("never removes or demotes the last active Owner", () => {
    const owner = { role: "Owner", active: true };
    expect(lastOwnerError(owner, { role: "Admin", active: true }, 0)).toMatch(/at least one active Owner/);
    expect(lastOwnerError(owner, { role: "Owner", active: false }, 0)).toMatch(/at least one active Owner/);
    expect(lastOwnerError(owner, null, 0)).toMatch(/only active Owner/);
    expect(lastOwnerError(owner, { role: "Owner", active: true }, 0)).toBeNull();
    expect(lastOwnerError(owner, { role: "Admin", active: true }, 1)).toBeNull();
    expect(lastOwnerError(owner, null, 1)).toBeNull();
    expect(lastOwnerError({ role: "Owner", active: false }, null, 0)).toBeNull();
    expect(lastOwnerError({ role: "Admin", active: true }, null, 0)).toBeNull();
  });
});

describe("server helpers", () => {
  beforeEach(() => getCurrentUser.mockReset());

  it("allows a permitted user", async () => {
    getCurrentUser.mockResolvedValue(user("Estimator"));
    expect(await denied("estimates.edit")).toBeNull();
    expect((await checkPermission("estimates.edit")).ok).toBe(true);
    await expect(requirePermission("estimates.edit")).resolves.toMatchObject({ role: "Estimator" });
    expect(await routeDenied("costs.view")).toBeNull();
  });

  it("returns a friendly message / redirects / throws when not permitted", async () => {
    getCurrentUser.mockResolvedValue(user("Estimator"));
    expect(await denied("invoices.payments")).toBe("You don't have permission to record payments.");
    await expect(requirePermission("settings.manage")).rejects.toThrow("REDIRECT:/forbidden?need=settings.manage");
    await expect(assertPermission("settings.manage")).rejects.toBeInstanceOf(PermissionError);
    expect((await routeDenied("settings.manage"))?.status).toBe(403);
  });

  it("treats no user (or an inactive one) as signed out", async () => {
    for (const u of [null, user("Owner", false)]) {
      getCurrentUser.mockResolvedValue(u);
      expect(await denied("jobs.view")).toBe("Please sign in to continue.");
      await expect(requirePermission("jobs.view")).rejects.toThrow("REDIRECT:/no-access");
      await expect(requireUser()).rejects.toThrow("REDIRECT:/no-access");
      expect((await routeDenied(null))?.status).toBe(401);
      const p = await currentPermissions();
      expect(p.user).toBeNull();
      expect(ACTIONS.some((a) => p[a])).toBe(false);
    }
  });

  it("currentPermissions exposes flags for the UI", async () => {
    getCurrentUser.mockResolvedValue(user("Read Only"));
    const p = await currentPermissions();
    expect(p.role).toBe("Read Only");
    expect(p["jobs.view"]).toBe(true);
    expect(p["costs.view"]).toBe(false);
  });
});
