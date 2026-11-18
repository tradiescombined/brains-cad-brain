import { describe, it, expect } from "vitest";
import {
  addWorkingDays,
  isWorkingDay,
  nextWorkingDay,
  snapToWorkingDay,
  workingDaysBetween,
  workingDaysInclusive,
  taskFinish,
  rescheduleDependants,
  shiftSchedule,
  sequentialChain,
  summarise,
  wouldCreateCycle,
  topoOrder,
  weekStart,
  isValidIsoDate,
  parseDependsOn,
  type SchedTask,
} from "./scheduling";

// 2026-11-16 is a Monday.
const MON = "2026-11-16";
const FRI = "2026-11-20";
const SAT = "2026-11-21";
const SUN = "2026-11-22";
const NEXT_MON = "2026-11-23";

describe("working days", () => {
  it("knows weekends", () => {
    expect(isWorkingDay(MON)).toBe(true);
    expect(isWorkingDay(FRI)).toBe(true);
    expect(isWorkingDay(SAT)).toBe(false);
    expect(isWorkingDay(SUN)).toBe(false);
  });
  it("snaps and steps over weekends", () => {
    expect(snapToWorkingDay(SAT)).toBe(NEXT_MON);
    expect(snapToWorkingDay(MON)).toBe(MON);
    expect(nextWorkingDay(FRI)).toBe(NEXT_MON);
    expect(addWorkingDays(MON, 4)).toBe(FRI);
    expect(addWorkingDays(MON, 5)).toBe(NEXT_MON);
    expect(addWorkingDays(FRI, 1)).toBe(NEXT_MON);
    expect(addWorkingDays(NEXT_MON, -1)).toBe(FRI);
    expect(addWorkingDays(SAT, 0)).toBe(NEXT_MON);
    expect(addWorkingDays(SUN, -1)).toBe("2026-11-19");
    expect(addWorkingDays(MON, 10)).toBe("2026-11-30");
  });
  it("counts working days between dates, signed", () => {
    expect(workingDaysBetween(MON, FRI)).toBe(4);
    expect(workingDaysBetween(MON, NEXT_MON)).toBe(5);
    expect(workingDaysBetween(NEXT_MON, MON)).toBe(-5);
    expect(workingDaysBetween(FRI, SAT)).toBe(1); // Saturday snaps to Monday
    expect(workingDaysBetween(MON, "2027-01-04")).toBe(35);
    for (const n of [0, 1, 3, 7, 22, -4, -13]) expect(workingDaysBetween(MON, addWorkingDays(MON, n))).toBe(n);
    expect(workingDaysInclusive(MON, SUN)).toBe(5);
    expect(workingDaysInclusive(FRI, MON)).toBe(0);
  });
  it("crosses month and year boundaries", () => {
    expect(addWorkingDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addWorkingDays("2027-01-01", 1)).toBe("2027-01-04");
    expect(weekStart("2026-11-22")).toBe(MON);
    expect(weekStart(MON)).toBe(MON);
    expect(weekStart("2026-11-19")).toBe(MON);
  });
  it("validates ISO dates and parses dependency JSON", () => {
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(isValidIsoDate("29/02/2028")).toBe(false);
    expect(parseDependsOn('["a","b"]')).toEqual(["a", "b"]);
    expect(parseDependsOn("nope")).toEqual([]);
  });
});

describe("task finish", () => {
  it("spans working days only", () => {
    expect(taskFinish({ startDate: MON, durationDays: 1 })).toBe(MON);
    expect(taskFinish({ startDate: "2026-11-19", durationDays: 3 })).toBe(NEXT_MON);
    expect(taskFinish({ startDate: SAT, durationDays: 2 })).toBe("2026-11-24");
    expect(taskFinish({ startDate: MON, durationDays: 0 })).toBe(MON); // min 1 day
  });
});

const t = (id: string, startDate: string, durationDays: number, dependsOn: string[] = []): SchedTask => ({ id, startDate, durationDays, dependsOn });

describe("dependency shifting", () => {
  it("pushes a chain when the first task gets longer", () => {
    const before = [t("a", MON, 2), t("b", "2026-11-18", 3, ["a"]), t("c", NEXT_MON, 1, ["b"])];
    const after = before.map((x) => (x.id === "a" ? { ...x, durationDays: 4 } : x));
    const r = rescheduleDependants(before, after, ["a"]);
    const by = Object.fromEntries(r.tasks.map((x) => [x.id, x.startDate]));
    expect(by.a).toBe(MON);
    expect(by.b).toBe(FRI); // a finishes Thu 19th
    expect(by.c).toBe("2026-11-25"); // b finishes Tue 24th
    expect(r.moved.sort()).toEqual(["b", "c"]);
  });

  it("preserves an existing lag between linked tasks", () => {
    // b starts 2 working days after a's natural successor date.
    const before = [t("a", MON, 1), t("b", "2026-11-19", 1, ["a"])];
    const after = [{ ...before[0], startDate: NEXT_MON }, before[1]];
    const r = rescheduleDependants(before, after, ["a"]);
    expect(r.tasks[1].startDate).toBe("2026-11-26"); // Tue 24 + 2 working days
  });

  it("pulls dependants earlier when a predecessor moves earlier, limited by other predecessors", () => {
    const before = [t("a", NEXT_MON, 1), t("x", MON, 3), t("b", "2026-11-24", 1, ["a", "x"])];
    const after = before.map((v) => (v.id === "a" ? { ...v, startDate: MON } : v));
    const r = rescheduleDependants(before, after, ["a"]);
    // x finishes Wed 18th so b can start Thu 19th... but x's link had lag (b started 24th, x allows 19th: lag 3)
    // so b stays at 24th via x's lag.
    expect(r.tasks.find((v) => v.id === "b")!.startDate).toBe("2026-11-24");
  });

  it("moves a dependant earlier when its only predecessor finishes earlier", () => {
    const before = [t("a", MON, 5), t("b", NEXT_MON, 2, ["a"])];
    const after = [{ ...before[0], durationDays: 2 }, before[1]];
    const r = rescheduleDependants(before, after, ["a"]);
    expect(r.tasks[1].startDate).toBe("2026-11-18");
  });

  it("pushes the edited task itself forward when its new predecessor finishes later", () => {
    const before = [t("a", MON, 3), t("b", MON, 1)];
    const after = [before[0], { ...before[1], dependsOn: ["a"] }];
    const r = rescheduleDependants(before, after, ["b"]);
    expect(r.tasks[1].startDate).toBe("2026-11-19");
    expect(r.moved).toEqual(["b"]);
  });

  it("leaves unrelated tasks alone", () => {
    const before = [t("a", MON, 1), t("b", MON, 1, ["a"]), t("z", MON, 1)];
    const after = before.map((v) => (v.id === "a" ? { ...v, durationDays: 2 } : v));
    const r = rescheduleDependants(before, after, ["a"]);
    expect(r.tasks.find((v) => v.id === "z")!.startDate).toBe(MON);
  });

  it("detects dependency cycles", () => {
    const tasks = [t("a", MON, 1), t("b", MON, 1, ["a"]), t("c", MON, 1, ["b"])];
    expect(wouldCreateCycle(tasks, "a", ["c"])).toBe(true);
    expect(wouldCreateCycle(tasks, "a", ["a"])).toBe(true);
    expect(wouldCreateCycle(tasks, "c", ["a"])).toBe(false);
    expect(topoOrder([t("c", MON, 1, ["b"]), t("b", MON, 1, ["a"]), t("a", MON, 1)])).toEqual(["a", "b", "c"]);
  });

  it("shifts a whole schedule by N working days", () => {
    const s = shiftSchedule([t("a", MON, 1), t("b", FRI, 1)], 1);
    expect(s.map((v) => v.startDate)).toEqual(["2026-11-17", NEXT_MON]);
    expect(shiftSchedule([t("a", MON, 1)], -1)[0].startDate).toBe("2026-11-13");
  });

  it("builds a sequential starter chain", () => {
    let i = 0;
    const c = sequentialChain([{ name: "Demo", durationDays: 2 }, { name: "Tiling", durationDays: 4 }, { name: "Fit off", durationDays: 1 }], SAT, () => `t${++i}`);
    expect(c.map((v) => v.startDate)).toEqual([NEXT_MON, "2026-11-25", "2026-12-01"]);
    expect(c[2].dependsOn).toEqual(["t2"]);
    expect(c[0].dependsOn).toEqual([]);
  });
});

describe("critical dates", () => {
  it("finds the critical path, float, overall dates and overdue tasks", () => {
    const tasks: SchedTask[] = [
      { ...t("a", MON, 2), progress: 100 },
      { ...t("b", "2026-11-18", 5, ["a"]), progress: 50 },
      { ...t("c", "2026-11-18", 2, ["a"]), progress: 0 },
      { ...t("d", "2026-11-25", 1, ["b", "c"]), progress: 0 },
    ];
    const s = summarise(tasks, "2026-11-23");
    expect(s.start).toBe(MON);
    expect(s.finish).toBe("2026-11-25");
    expect(s.workingDays).toBe(8);
    expect([...s.critical].sort()).toEqual(["a", "b", "d"]);
    expect(s.float.get("c")).toBe(3);
    expect([...s.overdue]).toEqual(["c"]); // c finished Thu 19th and is 0%
    expect(s.percentComplete).toBe(Math.round((2 * 100 + 5 * 50) / 10));
    expect(s.conflicts.size).toBe(0);
  });
  it("flags tasks starting before their predecessor allows", () => {
    const s = summarise([t("a", MON, 3), t("b", MON, 1, ["a"])], MON);
    expect([...s.conflicts]).toEqual(["b"]);
  });
  it("handles an empty schedule", () => {
    const s = summarise([], MON);
    expect(s.start).toBeNull();
    expect(s.workingDays).toBe(0);
  });
});
