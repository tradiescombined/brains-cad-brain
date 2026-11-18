/**
 * Client field definitions + validation, shared by the client form, quick-create, CSV import
 * and CSV export. Pure (no DB access).
 */
import type { CsvField } from "./csv";
import { parseIntLoose } from "./csv";

export type ClientInput = {
  name: string;
  clientType: "Person" | "Business";
  businessName: string | null;
  businessNumber: string | null;
  email: string | null;
  mobile: string | null;
  phone: string | null;
  address: string | null;
  cityTown: string | null;
  state: string | null;
  postcode: string | null;
  source: string | null;
  category: string | null;
  defaultInvoiceDays: number | null;
};

export type FieldErrors = Record<string, string>;
export type Validated<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

export const CLIENT_FIELDS: CsvField[] = [
  { key: "name", label: "Name", required: true, aliases: ["full name", "client", "client name", "contact name", "contact"] },
  { key: "clientType", label: "Type", aliases: ["client type", "person or business", "entity"] },
  { key: "businessName", label: "Business name", aliases: ["company", "company name", "business", "organisation", "organization", "trading name"] },
  { key: "businessNumber", label: "ABN", aliases: ["business number", "abn number", "acn", "abn/acn"] },
  { key: "email", label: "Email", aliases: ["email address", "e-mail"] },
  { key: "mobile", label: "Mobile", aliases: ["mobile phone", "cell", "mobile number"] },
  { key: "phone", label: "Phone", aliases: ["telephone", "phone number", "landline", "work phone"] },
  { key: "address", label: "Address", aliases: ["street", "street address", "address line 1", "address 1"] },
  { key: "cityTown", label: "City/Town", aliases: ["city", "town", "suburb", "locality"] },
  { key: "state", label: "State", aliases: ["region", "province", "territory"] },
  { key: "postcode", label: "Postcode", aliases: ["post code", "zip", "zip code", "postal code"] },
  { key: "source", label: "Source", aliases: ["lead source", "referral source", "how did you hear"] },
  { key: "category", label: "Category", aliases: ["client category", "segment"] },
  { key: "defaultInvoiceDays", label: "Invoice due days", aliases: ["default invoice days", "payment terms", "terms", "due days"] },
];

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trimmed string or null. */
export function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/** Accepts "Business", "company", "B" etc. Falls back to Business when a business name is given. */
export function parseClientType(v: string | null, businessName: string | null): "Person" | "Business" {
  const s = (v ?? "").trim().toLowerCase();
  if (/^(b|business|company|co|organisation|organization|commercial|trust|pty ltd)$/.test(s)) return "Business";
  if (/^(p|person|individual|private|homeowner|residential)$/.test(s)) return "Person";
  return businessName ? "Business" : "Person";
}

/** Digits-only ABN check (11 digits). Spaces allowed. Returns normalised "12 345 678 901". */
export function normaliseAbn(v: string): string | null {
  const d = v.replace(/\s/g, "");
  if (!/^\d{11}$/.test(d)) return null;
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
}

export function validateEmail(v: string | null, errors: FieldErrors, key = "email") {
  if (v && !EMAIL_RE.test(v)) errors[key] = "Enter a valid email address.";
}

export function validateDays(v: string | null, errors: FieldErrors, key: string, label = "Days") {
  const n = parseIntLoose(v);
  if (n === null) return null;
  if (Number.isNaN(n) || n < 0 || n > 365) {
    errors[key] = `${label} must be a whole number from 0 to 365.`;
    return null;
  }
  return n;
}

/** Validates raw (form or CSV) values into a client record. */
export function validateClient(raw: Record<string, unknown>): Validated<ClientInput> {
  const errors: FieldErrors = {};
  const businessName = clean(raw.businessName);
  const clientType = parseClientType(clean(raw.clientType), businessName);
  const name = clean(raw.name) ?? (clientType === "Business" ? businessName : null);
  if (!name) errors.name = clientType === "Business" ? "Enter a contact name or business name." : "Enter the client's name.";
  else if (name.length > 120) errors.name = "Name is too long (120 characters max).";
  if (clientType === "Business" && !businessName) errors.businessName = "Business name is required for a business client.";

  let businessNumber = clientType === "Business" ? clean(raw.businessNumber) : null;
  if (businessNumber) {
    const abn = normaliseAbn(businessNumber);
    if (!abn) errors.businessNumber = "ABN must be 11 digits.";
    else businessNumber = abn;
  }
  const email = clean(raw.email)?.toLowerCase() ?? null;
  validateEmail(email, errors);
  const postcode = clean(raw.postcode);
  if (postcode && !/^[A-Za-z0-9 -]{3,10}$/.test(postcode)) errors.postcode = "Postcode looks invalid.";
  const defaultInvoiceDays = validateDays(clean(raw.defaultInvoiceDays), errors, "defaultInvoiceDays", "Invoice due days");

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      name: name!,
      clientType,
      businessName: clientType === "Business" ? businessName : null,
      businessNumber,
      email,
      mobile: clean(raw.mobile),
      phone: clean(raw.phone),
      address: clean(raw.address),
      cityTown: clean(raw.cityTown),
      state: clean(raw.state)?.toUpperCase() ?? null,
      postcode,
      source: clean(raw.source),
      category: clean(raw.category),
      defaultInvoiceDays,
    },
  };
}

/** Name shown in lists: business name for businesses, else the person's name. */
export function clientDisplayName(c: { name: string; clientType?: string | null; businessName?: string | null }): string {
  return c.clientType === "Business" && c.businessName ? c.businessName : c.name;
}

export type ClientContactInput = { name: string; role: string | null; email: string | null; mobile: string | null; phone: string | null; isPrimary: boolean };

export function validateClientContact(raw: Record<string, unknown>): Validated<ClientContactInput> {
  const errors: FieldErrors = {};
  const name = clean(raw.name);
  if (!name) errors.name = "Enter the contact's name.";
  const email = clean(raw.email)?.toLowerCase() ?? null;
  validateEmail(email, errors);
  if (Object.keys(errors).length) return { ok: false, errors };
  const p = raw.isPrimary;
  return {
    ok: true,
    data: { name: name!, role: clean(raw.role), email, mobile: clean(raw.mobile), phone: clean(raw.phone), isPrimary: p === true || p === "on" || p === "true" || p === "1" },
  };
}

/** Converts FormData to a plain object (multi-value keys become arrays). */
export function formToObject(fd: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION") || typeof v !== "string") continue;
    const prev = out[k];
    out[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  return out;
}

/** Only allow same-site relative return paths. */
export function safeReturnTo(v: unknown, fallback = "/clients"): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.includes("\\") ? s : fallback;
}

/** Appends/replaces a query param on a relative path. */
export function withParam(path: string, key: string, value: string): string {
  const [base, hash = ""] = path.split("#");
  const [p, q = ""] = base.split("?");
  const sp = new URLSearchParams(q);
  sp.set(key, value);
  return `${p}?${sp.toString()}${hash ? "#" + hash : ""}`;
}
