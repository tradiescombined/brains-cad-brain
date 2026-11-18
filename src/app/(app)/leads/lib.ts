/**
 * Pure lead helpers (no DB, no server-only) so they can be unit tested and shared
 * between server actions, server components and client components.
 */
import { z } from "zod";

export const LEAD_STAGES = ["New", "Contacted", "Site visit", "Quoting", "Quote sent", "Won", "Lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export const OPEN_STAGES: readonly LeadStage[] = LEAD_STAGES.filter((s) => s !== "Won" && s !== "Lost");

export function isLeadStage(v: unknown): v is LeadStage {
  return typeof v === "string" && (LEAD_STAGES as readonly string[]).includes(v);
}

export const NEW_CLIENT = "__new__";

/** Next lead number from existing numbers: max numeric suffix of `L<digits>` + 1, starting at L1000. */
export function nextLeadNumber(existing: (string | null | undefined)[], prefix = "L", start = 1000): string {
  let max = start - 1;
  const re = new RegExp(`^${prefix}(\\d+)$`, "i");
  for (const n of existing) {
    const m = n ? re.exec(n.trim()) : null;
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}${max + 1}`;
}

/** A follow-up is overdue when its date is before today and the lead is still open. */
export function isFollowUpOverdue(followUpDate: string | null | undefined, stage: string, today: string): boolean {
  if (!followUpDate || stage === "Won" || stage === "Lost") return false;
  return followUpDate.slice(0, 10) < today;
}

/** Weighted value = estimated value × probability%. */
export function weightedValue(value: number | null | undefined, probability: number | null | undefined): number {
  return (Number(value) || 0) * ((Number(probability) || 0) / 100);
}

type Summable = { stage: string; estimatedValue: number | null; probability: number | null };

/** Count and value totals per stage (every stage present, in pipeline order). */
export function stageTotals<T extends Summable>(leads: T[]) {
  return LEAD_STAGES.map((stage) => {
    const rows = leads.filter((l) => l.stage === stage);
    return {
      stage,
      count: rows.length,
      value: rows.reduce((s, l) => s + (Number(l.estimatedValue) || 0), 0),
      weighted: rows.reduce((s, l) => s + weightedValue(l.estimatedValue, l.probability), 0),
    };
  });
}

/** Headline pipeline numbers across open leads. */
export function pipelineSummary<T extends Summable & { followUpDate: string | null }>(leads: T[], today: string) {
  const open = leads.filter((l) => l.stage !== "Won" && l.stage !== "Lost");
  const won = leads.filter((l) => l.stage === "Won").length;
  const lost = leads.filter((l) => l.stage === "Lost").length;
  return {
    openCount: open.length,
    openValue: open.reduce((s, l) => s + (Number(l.estimatedValue) || 0), 0),
    weighted: open.reduce((s, l) => s + weightedValue(l.estimatedValue, l.probability), 0),
    overdue: open.filter((l) => isFollowUpOverdue(l.followUpDate, l.stage, today)).length,
    winRate: won + lost ? Math.round((won / (won + lost)) * 100) : null,
  };
}

/** Initials for an assignee avatar. */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

// ---------- form parsing / validation ----------

const optText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .transform((v) => (v === "" ? null : v));

const optDate = z
  .string()
  .trim()
  .refine((v) => v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v + "T00:00:00").getTime())), "Enter a valid date")
  .transform((v) => (v === "" ? null : v));

const optNumber = (opts: { min?: number; max?: number; int?: boolean; label: string }) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/[$,\s]/g, ""))
    .refine((v) => v === "" || !isNaN(Number(v)), `${opts.label} must be a number`)
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || opts.min === undefined || v >= opts.min, `${opts.label} must be at least ${opts.min}`)
    .refine((v) => v === null || opts.max === undefined || v <= opts.max, `${opts.label} must be ${opts.max} or less`)
    .transform((v) => (v !== null && opts.int ? Math.round(v) : v));

export const leadFormSchema = z.object({
  title: z.string().trim().min(1, "Give the lead a title").max(200, "Keep the title under 200 characters"),
  contactName: optText(200),
  email: z
    .string()
    .trim()
    .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address")
    .transform((v) => (v === "" ? null : v)),
  phone: optText(50),
  clientId: optText(100),
  address: optText(300),
  cityTown: optText(100),
  state: optText(50),
  postcode: optText(12),
  source: optText(100),
  buildingType: optText(100),
  estimatedValue: optNumber({ min: 0, max: 1_000_000_000, label: "Estimated value" }),
  probability: optNumber({ min: 0, max: 100, int: true, label: "Probability" }),
  expectedStart: optDate,
  followUpDate: optDate,
  assignedTo: optText(100),
  description: optText(5000),
  stage: z.enum(LEAD_STAGES, { error: "Choose a stage" }),
  lostReason: optText(500),
});

export type LeadInput = z.infer<typeof leadFormSchema>;
export const LEAD_FIELDS = Object.keys(leadFormSchema.shape) as (keyof LeadInput)[];
export type LeadFormValues = Record<keyof LeadInput, string>;
export type LeadFormState = {
  ok?: boolean;
  message?: string;
  errors?: Partial<Record<keyof LeadInput, string>>;
  values?: LeadFormValues;
};

/** Reads raw string values for every lead field from a FormData-like object. */
export function rawLeadValues(fd: { get(name: string): unknown }): LeadFormValues {
  const out = {} as LeadFormValues;
  for (const k of LEAD_FIELDS) {
    const v = fd.get(k);
    out[k] = typeof v === "string" ? v : "";
  }
  if (!out.stage) out.stage = "New";
  return out;
}

export function parseLeadForm(raw: LeadFormValues): { ok: true; data: LeadInput } | { ok: false; errors: Partial<Record<keyof LeadInput, string>> } {
  const r = leadFormSchema.safeParse(raw);
  if (r.success) {
    const data = { ...r.data };
    if (data.stage !== "Lost") data.lostReason = null;
    return { ok: true, data };
  }
  const errors: Partial<Record<keyof LeadInput, string>> = {};
  for (const issue of r.error.issues) {
    const k = issue.path[0] as keyof LeadInput;
    if (k && !errors[k]) errors[k] = issue.message;
  }
  return { ok: false, errors };
}

/** Converts a DB row (or defaults) into string form values. */
export function toFormValues(row: Partial<Record<keyof LeadInput, string | number | null | undefined>>): LeadFormValues {
  const out = {} as LeadFormValues;
  for (const k of LEAD_FIELDS) {
    const v = row[k];
    out[k] = v === null || v === undefined ? "" : String(v);
  }
  if (!out.stage) out.stage = "New";
  return out;
}

/** Builds a URL for the leads list preserving filters. Empty values are dropped. */
export function leadsHref(params: Record<string, string | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `/leads?${s}` : "/leads";
}

/** Markup lines JSON for a new estimate from the business default markup %. */
export function defaultMarkupLines(percent: number | null | undefined): string {
  return JSON.stringify([{ name: "Markup", percent: Number(percent) || 0 }]);
}
