import { describe, expect, it } from "vitest";
import { authBypassEnabled } from "./auth-bypass";

describe("authBypassEnabled", () => {
  it("is off unless BCB_AUTH_BYPASS is exactly 1", () => {
    expect(authBypassEnabled({})).toBe(false);
    expect(authBypassEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(authBypassEnabled({ NODE_ENV: "development", BCB_AUTH_BYPASS: "true" })).toBe(false);
    expect(authBypassEnabled({ NODE_ENV: "development", BCB_AUTH_BYPASS: "" })).toBe(false);
  });

  it("works on its own outside production (next dev, unit tests)", () => {
    expect(authBypassEnabled({ NODE_ENV: "development", BCB_AUTH_BYPASS: "1" })).toBe(true);
    expect(authBypassEnabled({ NODE_ENV: "test", BCB_AUTH_BYPASS: "1" })).toBe(true);
    expect(authBypassEnabled({ BCB_AUTH_BYPASS: "1" })).toBe(true);
  });

  it("is ignored in a production build unless BCB_ALLOW_TEST_BYPASS=1 is also set", () => {
    expect(authBypassEnabled({ NODE_ENV: "production", BCB_AUTH_BYPASS: "1" })).toBe(false);
    expect(authBypassEnabled({ NODE_ENV: "production", BCB_AUTH_BYPASS: "1", BCB_ALLOW_TEST_BYPASS: "true" })).toBe(false);
    expect(authBypassEnabled({ NODE_ENV: "production", BCB_ALLOW_TEST_BYPASS: "1" })).toBe(false);
    expect(authBypassEnabled({ NODE_ENV: "production", BCB_AUTH_BYPASS: "1", BCB_ALLOW_TEST_BYPASS: "1" })).toBe(true);
  });

  it("is never honoured on a deployed Vercel production site", () => {
    expect(authBypassEnabled({ NODE_ENV: "production", VERCEL: "1", BCB_AUTH_BYPASS: "1" })).toBe(false);
    expect(authBypassEnabled({ NODE_ENV: "production", VERCEL: "1", BCB_AUTH_BYPASS: "1", BCB_ALLOW_TEST_BYPASS: "1" })).toBe(false);
  });
});
