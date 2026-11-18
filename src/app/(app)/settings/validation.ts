/** Pure validation + list helpers for Settings (unit tested; no DB access). */
import { z } from "zod";

export const ROLES = ["Owner", "Admin", "Estimator", "Project Manager", "Site Supervisor", "Read Only"] as const;
export const CURRENCIES = ["AUD", "NZD", "USD", "GBP", "CAD", "EUR"] as const;
export const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"] as const;

/** FormData → plain object of strings (checkboxes become "on"; files are skipped). */
export function formToObject(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") o[k] = v;
  return o;
}

const optText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters`)
    .optional()
    .transform((v) => (v ? v : null));

const optEmail = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email address");

const bool = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true" || v === "1");

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Australian Business Number checksum (weights per ATO algorithm). */
export function isValidAbn(raw: string): boolean {
  const d = raw.replace(/\s/g, "");
  if (!/^\d{11}$/.test(d)) return false;
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const digits = d.split("").map(Number);
  digits[0] -= 1;
  return digits.reduce((s, n, i) => s + n * w[i], 0) % 89 === 0;
}

export const businessSchema = z
  .object({
    businessName: z.string().trim().min(1, "Business name is required").max(120),
    tradingName: optText(120),
    businessNumber: optText(30),
    licenceNumber: optText(50),
    email: optEmail,
    phone: optText(40),
    website: optText(200),
    address: optText(200),
    cityTown: optText(80),
    state: optText(40),
    postcode: optText(12),
    country: z.string().trim().min(1, "Country is required").max(60),
    currency: z.enum(CURRENCIES, "Choose a currency"),
    brandColour: z.string().trim().regex(HEX_RE, "Use a hex colour like #0f766e"),
  })
  .superRefine((v, ctx) => {
    if (v.businessNumber && v.country.toLowerCase() === "australia" && !isValidAbn(v.businessNumber))
      ctx.addIssue({ code: "custom", path: ["businessNumber"], message: "That ABN doesn't look right (11 digits, failed checksum)" });
    if (v.postcode && v.country.toLowerCase() === "australia" && !/^\d{4}$/.test(v.postcode))
      ctx.addIssue({ code: "custom", path: ["postcode"], message: "Australian postcodes are 4 digits" });
  });

export const userSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(60),
  surname: optText(60),
  email: z.string().trim().min(1, "Email is required").pipe(z.email("Enter a valid email address")),
  mobile: optText(40),
  role: z.enum(ROLES, "Choose a role"),
  active: bool,
});

const percent = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .transform((v) => Number(v.replace(/%/g, "")))
    .refine((n) => Number.isFinite(n), `${label} must be a number`)
    .refine((n) => n >= min && n <= max, `${label} must be between ${min} and ${max}`);

export const taxRateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(12, "Keep the code short (12 characters)")
    .regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, - and _ only")
    .transform((s) => s.toUpperCase()),
  name: z.string().trim().min(1, "Name is required").max(80),
  ratePercent: percent("Rate", 0, 100),
  appliesTo: z.enum(["income", "expense"], "Choose income or expense"),
  isDefault: bool,
  active: bool,
});

const prefix = z
  .string()
  .trim()
  .max(10, "Max 10 characters")
  .regex(/^[A-Za-z0-9\-_/.]*$/, "No spaces or special characters");
const nextNo = z
  .string()
  .trim()
  .min(1, "Required")
  .transform(Number)
  .refine((n) => Number.isInteger(n) && n >= 0 && n <= 99_999_999, "Whole number from 0");

export const NUMBERING_KINDS = [
  { key: "estimate", label: "Estimates / quotes" },
  { key: "job", label: "Jobs" },
  { key: "invoice", label: "Invoices" },
  { key: "order", label: "Purchase orders" },
  { key: "variation", label: "Variations" },
] as const;

export const numberingSchema = z.object({
  estimateNumberPrefix: prefix,
  nextEstimateNumber: nextNo,
  jobNumberPrefix: prefix,
  nextJobNumber: nextNo,
  invoiceNumberPrefix: prefix,
  nextInvoiceNumber: nextNo,
  orderNumberPrefix: prefix,
  nextOrderNumber: nextNo,
  variationNumberPrefix: prefix,
  nextVariationNumber: nextNo,
});

/**
 * Lowest counter that won't collide with existing numbers that share the prefix.
 * e.g. prefix "Q", existing ["Q1000","Q1004","X9"] → 1005.
 */
export function minSafeNext(prefix: string, existing: (string | null)[]): number {
  let max = -1;
  for (const n of existing) {
    if (!n || !n.startsWith(prefix)) continue;
    const rest = n.slice(prefix.length);
    if (/^\d+$/.test(rest)) max = Math.max(max, Number(rest));
  }
  return max + 1;
}

const intRange = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .transform(Number)
    .refine((n) => Number.isInteger(n) && n >= min && n <= max, `${label}: whole number ${min}–${max}`);

export const quoteDefaultsSchema = z.object({
  defaultMarkupPercent: percent("Default markup", 0, 1000),
  quoteValidDays: intRange("Quote valid for", 1, 365),
  defaultInvoiceDueDays: intRange("Invoice due", 0, 365),
  defaultTaxRateId: z.string().trim().optional().transform((v) => v || null),
  bankDetails: optText(1000),
});

export const lookupNameSchema = z.string().trim().min(1, "Name can't be blank").max(80, "Keep it under 80 characters");

/** Kinds of lookup lists and how they're described in Settings. */
export const LOOKUP_KINDS: { kind: string; label: string; hint: string }[] = [
  { kind: "estimate_status", label: "Estimate statuses", hint: "Stages an estimate moves through. Mark one as the 'accepted' status — it counts as a win and unlocks job creation." },
  { kind: "building_type", label: "Building types", hint: "Used to categorise estimates and leads." },
  { kind: "unit_measure", label: "Units of measure", hint: "Units available on costing and catalogue items (e.g. m2, lm, ea)." },
  { kind: "contact_type", label: "Contact types", hint: "How suppliers, trades and other contacts are classified." },
  { kind: "contact_group", label: "Contact groups", hint: "Trade groups for filtering suppliers and subcontractors." },
  { kind: "client_source", label: "Client sources", hint: "Where clients and leads heard about you." },
  { kind: "client_type", label: "Client types", hint: "Categories of client." },
  { kind: "lead_status", label: "Lead statuses", hint: "Optional custom labels for lead follow-up." },
  { kind: "job_status", label: "Job statuses", hint: "Optional custom labels for job progress." },
  { kind: "document_folder", label: "Document folders", hint: "Folders offered when uploading documents to records." },
];

export function lookupKindLabel(kind: string): string {
  return LOOKUP_KINDS.find((k) => k.kind === kind)?.label ?? kind.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Known list kinds first (in display order), then any other kinds found in the data. */
export function allLookupKinds(kindsInData: string[]): { kind: string; label: string; hint: string }[] {
  const extra = [...new Set(kindsInData)].filter((k) => !LOOKUP_KINDS.some((x) => x.kind === k)).sort();
  return [...LOOKUP_KINDS, ...extra.map((kind) => ({ kind, label: lookupKindLabel(kind), hint: "Custom list." }))];
}

/** Move `id` one step up/down in an ordered id list. Returns a new array (unchanged at the ends). */
export function moveInOrder(ids: string[], id: string, dir: "up" | "down"): string[] {
  const i = ids.indexOf(id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return ids.slice();
  const out = ids.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** True if `name` duplicates another value (case-insensitive) excluding `selfId`. */
export function isDuplicateName(rows: { id: string; name: string }[], name: string, selfId?: string): boolean {
  const n = name.trim().toLowerCase();
  return rows.some((r) => r.id !== selfId && r.name.trim().toLowerCase() === n);
}

export const MAX_LOGO_BYTES = 1024 * 1024;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp", "image/gif"];
