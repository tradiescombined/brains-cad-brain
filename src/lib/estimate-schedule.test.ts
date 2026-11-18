import { describe, it, expect } from "vitest";
import { copySchedule, offsetScheduleTo, planTaskSave, remapTaskIds, scheduleStart, taskFinish, type SchedTask } from "./scheduling";

function seq(prefix = "n") {
  let i = 0;
  return () => `${prefix}${++i}`;
}

// 2026-11-16 is a Monday.
const plan: (SchedTask & { name: string })[] = [
  { id: "a", name: "Demo", startDate: "2026-11-16", durationDays: 2, dependsOn: [] }, // Mon–Tue
  { id: "b", name: "Frame", startDate: "2026-11-18", durationDays: 3, dependsOn: ["a"] }, // Wed–Fri
  { id: "c", name: "Roof", startDate: "2026-11-24", durationDays: 2, dependsOn: ["b"] }, // Tue–Wed (1 day lag)
  { id: "d", name: "Electrical", startDate: "2026-11-18", durationDays: 1, dependsOn: ["a", "outside"] },
];

describe("remapTaskIds", () => {
  it("gives fresh ids and rewrites dependencies to them", () => {
    const { tasks, idMap } = remapTaskIds(plan, seq());
    expect(tasks.map((t) => t.id)).toEqual(["n1", "n2", "n3", "n4"]);
    expect(idMap.get("a")).toBe("n1");
    expect(tasks[1].dependsOn).toEqual(["n1"]);
    expect(tasks[2].dependsOn).toEqual(["n2"]);
  });

  it("drops links to tasks outside the set and self links, de-duplicates", () => {
    const { tasks } = remapTaskIds([...plan, { id: "e", startDate: "2026-11-16", durationDays: 1, dependsOn: ["e", "a", "a"] }], seq());
    expect(tasks[3].dependsOn).toEqual(["n1"]);
    expect(tasks[4].dependsOn).toEqual(["n1"]);
  });

  it("does not mutate its input", () => {
    remapTaskIds(plan, seq());
    expect(plan[1]).toMatchObject({ id: "b", dependsOn: ["a"] });
  });
});

describe("scheduleStart", () => {
  it("is the earliest working day any task occupies", () => {
    expect(scheduleStart(plan)).toBe("2026-11-16");
    expect(scheduleStart([{ startDate: "2026-11-21" }, { startDate: "2026-11-24" }])).toBe("2026-11-23"); // Sat → Mon
    expect(scheduleStart([])).toBeNull();
  });
});

describe("offsetScheduleTo", () => {
  it("moves the first task to the date and keeps durations, links and gaps (working days)", () => {
    const out = offsetScheduleTo(plan, "2026-12-07"); // Monday, 15 working days later
    expect(out.map((t) => t.startDate)).toEqual(["2026-12-07", "2026-12-09", "2026-12-15", "2026-12-09"]);
    expect(out.map((t) => t.durationDays)).toEqual([2, 3, 2, 1]);
    expect(out[2].dependsOn).toEqual(["b"]);
    expect(taskFinish(out[2])).toBe("2026-12-16");
  });

  it("snaps a weekend start forward to Monday", () => {
    expect(offsetScheduleTo(plan, "2026-12-05")[0].startDate).toBe("2026-12-07");
  });

  it("can bring a schedule earlier", () => {
    const out = offsetScheduleTo(plan, "2026-11-09");
    expect(out.map((t) => t.startDate)).toEqual(["2026-11-09", "2026-11-11", "2026-11-17", "2026-11-11"]);
  });

  it("handles a weekend-crossing gap correctly", () => {
    // Start on a Thursday: Demo Thu–Fri, Frame Mon–Wed, Roof one day after Frame (Fri) – Mon.
    const out = offsetScheduleTo(plan, "2026-11-19");
    expect(out.map((t) => t.startDate)).toEqual(["2026-11-19", "2026-11-23", "2026-11-27", "2026-11-23"]);
    expect(taskFinish(out[2])).toBe("2026-11-30");
  });
});

describe("copySchedule (estimate → job)", () => {
  it("remaps ids and offsets to the job start date", () => {
    const out = copySchedule(plan, "2027-01-04", seq("j"));
    expect(out.map((t) => t.id)).toEqual(["j1", "j2", "j3", "j4"]);
    expect(out[0].startDate).toBe("2027-01-04");
    expect(out[1].dependsOn).toEqual(["j1"]);
    expect(out[3].dependsOn).toEqual(["j1"]);
    expect(out.map((t) => t.name)).toEqual(["Demo", "Frame", "Roof", "Electrical"]);
  });

  it("keeps the planned dates when no start date is given (snapped to working days)", () => {
    const out = copySchedule([{ ...plan[0], startDate: "2026-11-14" }, plan[1]], null, seq());
    expect(out.map((t) => t.startDate)).toEqual(["2026-11-16", "2026-11-18"]);
    expect(out[1].dependsOn).toEqual(["n1"]);
  });

  it("is empty for an empty schedule", () => {
    expect(copySchedule([], "2027-01-04", seq())).toEqual([]);
  });
});

describe("planTaskSave", () => {
  const before: SchedTask[] = plan.map((t) => ({ id: t.id, startDate: t.startDate, durationDays: t.durationDays, dependsOn: t.dependsOn }));

  it("adds a task pushed after its predecessor", () => {
    const r = planTaskSave(before, { newId: "x", startDate: "2026-11-16", durationDays: 1, dependsOn: ["c"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.id).toBe("x");
    expect(r.final.startDate).toBe("2026-11-26"); // Roof finishes Wed 25th
  });

  it("re-schedules dependants when a task gets longer", () => {
    const r = planTaskSave(before, { id: "a", newId: "unused", startDate: "2026-11-16", durationDays: 4, dependsOn: [] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.moved.sort()).toEqual(["b", "c", "d"]);
    expect(r.tasks.find((t) => t.id === "b")!.startDate).toBe("2026-11-20");
  });

  it("rejects loops and unknown tasks, ignores unknown predecessors", () => {
    const loop = planTaskSave(before, { id: "a", newId: "u", startDate: "2026-11-16", durationDays: 2, dependsOn: ["c"] });
    expect(loop).toEqual({ ok: false, error: expect.stringMatching(/loop/) });
    expect(planTaskSave(before, { id: "nope", newId: "u", startDate: "2026-11-16", durationDays: 1, dependsOn: [] }).ok).toBe(false);
    const r = planTaskSave(before, { newId: "y", startDate: "2026-11-21", durationDays: 1, dependsOn: ["ghost", "y"] });
    expect(r.ok && r.preds).toEqual([]);
    expect(r.ok && r.final.startDate).toBe("2026-11-23");
  });
});
