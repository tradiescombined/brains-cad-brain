import { describe, it, expect } from "vitest";
import { addDays } from "./format";

describe("addDays", () => {
  it("adds calendar days without timezone drift", () => {
    expect(addDays("2026-11-18", 14)).toBe("2026-12-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-11-18T05:00:00.000Z", 0)).toBe("2026-11-18");
  });
});
