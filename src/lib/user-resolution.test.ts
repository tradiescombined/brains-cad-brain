import { describe, expect, it } from "vitest";
import { authBypassEnabled } from "./auth-bypass";
import { providerLabel, providerName, resolveUser, type ClerkIdentity, type UserRowLike } from "./user-resolution";

const NOW = "2026-11-18T00:00:00.000Z";

function row(p: Partial<UserRowLike> & { id: string; email: string }): UserRowLike {
  return { firstName: "X", surname: null, role: "Estimator", active: true, clerkUserId: null, createdAt: "2026-01-01", ...p };
}

function who(p: Partial<ClerkIdentity> = {}): ClerkIdentity {
  return {
    clerkUserId: "user_1",
    email: "Pat@Example.com",
    emailVerified: true,
    firstName: "Pat",
    lastName: "Builder",
    provider: "google",
    ...p,
  };
}

const placeholderOwner = row({ id: "o", firstName: "Owner", email: "owner@example.com", role: "Owner" });

describe("resolveUser", () => {
  it("returns the row already linked to the Clerk user", () => {
    const u = row({ id: "a", email: "other@x.com", clerkUserId: "user_1" });
    expect(resolveUser(who(), [placeholderOwner, u], { now: NOW })).toEqual({ kind: "ok", user: u });
  });

  it("blocks a linked but inactive user", () => {
    const u = row({ id: "a", email: "pat@example.com", clerkUserId: "user_1", active: false });
    expect(resolveUser(who(), [u]).kind).toBe("inactive");
  });

  it("links an invited user by email (case-insensitive) and takes names from Clerk", () => {
    const linkedOwner = row({ id: "o", email: "boss@x.com", role: "Owner", clerkUserId: "user_0" });
    const invited = row({ id: "b", firstName: "P", email: "pat@example.com" });
    const r = resolveUser(who(), [linkedOwner, invited], { now: NOW });
    expect(r).toEqual({
      kind: "link",
      user: invited,
      updates: {
        clerkUserId: "user_1",
        email: "pat@example.com",
        firstName: "Pat",
        surname: "Builder",
        signInProvider: "google",
        linkedAt: NOW,
      },
    });
  });

  it("keeps existing names when Clerk has none", () => {
    const invited = row({ id: "b", firstName: "Pat", surname: "B", email: "pat@example.com" });
    const r = resolveUser(who({ firstName: null, lastName: null, provider: "apple" }), [placeholderOwner, invited], { now: NOW });
    expect(r.kind).toBe("link");
    if (r.kind === "link") {
      expect(r.updates).not.toHaveProperty("firstName");
      expect(r.updates).not.toHaveProperty("surname");
      expect(r.updates.signInProvider).toBe("apple");
    }
  });

  it("does not link an inactive invited user", () => {
    const invited = row({ id: "b", email: "pat@example.com", active: false });
    expect(resolveUser(who(), [placeholderOwner, invited]).kind).toBe("inactive");
  });

  it("first sign-in on a fresh install claims the placeholder Owner", () => {
    const r = resolveUser(who(), [placeholderOwner, row({ id: "e", email: "est@x.com" })], { now: NOW });
    expect(r.kind).toBe("link");
    if (r.kind === "link") {
      expect(r.user.id).toBe("o");
      expect(r.updates.email).toBe("pat@example.com");
    }
  });

  it("creates an Owner when the users table is empty", () => {
    const r = resolveUser(who({ firstName: null, lastName: null }), [], { now: NOW });
    expect(r).toMatchObject({ kind: "createOwner", values: { role: "Owner", active: true, firstName: "pat", email: "pat@example.com" } });
  });

  it("does not hand out Owner on a fresh install that already has a real Owner", () => {
    const realOwner = row({ id: "o", email: "boss@x.com", role: "Owner" });
    expect(resolveUser(who(), [realOwner])).toEqual({ kind: "unknown", email: "pat@example.com" });
  });

  it("once anyone has signed in, unknown emails get no access (invite only)", () => {
    const linkedOwner = { ...placeholderOwner, clerkUserId: "user_0" };
    expect(resolveUser(who(), [linkedOwner]).kind).toBe("unknown");
  });

  it("BCB_OWNER_EMAIL restricts who can claim the fresh install", () => {
    expect(resolveUser(who(), [placeholderOwner], { ownerEmail: "boss@x.com" }).kind).toBe("unknown");
    expect(resolveUser(who(), [placeholderOwner], { ownerEmail: "PAT@example.com" }).kind).toBe("link");
  });

  it("never matches or claims on an unverified email", () => {
    const invited = row({ id: "b", email: "pat@example.com" });
    expect(resolveUser(who({ emailVerified: false }), [placeholderOwner, invited]).kind).toBe("unknown");
    expect(resolveUser(who({ email: null }), []).kind).toBe("unknown");
  });
});

describe("provider helpers", () => {
  it("normalises and labels providers", () => {
    expect(providerName("oauth_google")).toBe("google");
    expect(providerName("apple")).toBe("apple");
    expect(providerName(undefined)).toBeNull();
    expect(providerLabel("google")).toBe("Google");
    expect(providerLabel("apple")).toBe("Apple");
    expect(providerLabel(null)).toBe("email");
  });
});

describe("authBypassEnabled", () => {
  it("is off unless BCB_AUTH_BYPASS=1", () => {
    expect(authBypassEnabled({})).toBe(false);
    expect(authBypassEnabled({ BCB_AUTH_BYPASS: "true" })).toBe(false);
    expect(authBypassEnabled({ BCB_AUTH_BYPASS: "1", NODE_ENV: "production" })).toBe(true);
  });
  it("is refused on a deployed Vercel production site", () => {
    expect(authBypassEnabled({ BCB_AUTH_BYPASS: "1", NODE_ENV: "production", VERCEL: "1" })).toBe(false);
  });
});
