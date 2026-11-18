/**
 * Supplier/trade contact fields + validation, shared by the form, CSV import and export. Pure.
 */
import type { CsvField } from "../clients/csv";
import { parseDateLoose, parseIntLoose, splitList } from "../clients/csv";
import { clean, normaliseAbn, validateDays, validateEmail, type FieldErrors, type Validated } from "../clients/fields";

export type ContactInput = {
  name: string;
  businessName: string | null;
  contactType: string | null;
  groups: string[];
  trade: string | null;
  email: string | null;
  mobile: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  cityTown: string | null;
  state: string | null;
  postcode: string | null;
  businessNumber: string | null;
  accountNumber: string | null;
  paymentTermsDays: number | null;
  insuranceExpiry: string | null;
  licenceNumber: string | null;
  rating: number | null;
  notes: string | null;
};

export const CONTACT_FIELDS: CsvField[] = [
  { key: "name", label: "Name", required: true, aliases: ["contact", "contact name", "full name", "supplier", "supplier name"] },
  { key: "businessName", label: "Business name", aliases: ["company", "company name", "business", "trading name"] },
  { key: "contactType", label: "Type", aliases: ["contact type", "category"] },
  { key: "groups", label: "Groups", aliases: ["group", "contact groups", "tags"] },
  { key: "trade", label: "Trade", aliases: ["trade type", "occupation", "speciality", "specialty"] },
  { key: "email", label: "Email", aliases: ["email address", "e-mail"] },
  { key: "mobile", label: "Mobile", aliases: ["mobile phone", "cell", "mobile number"] },
  { key: "phone", label: "Phone", aliases: ["telephone", "phone number", "work phone", "landline"] },
  { key: "website", label: "Website", aliases: ["web", "url", "site"] },
  { key: "address", label: "Address", aliases: ["street", "street address", "address line 1"] },
  { key: "cityTown", label: "City/Town", aliases: ["city", "town", "suburb"] },
  { key: "state", label: "State", aliases: ["region", "territory"] },
  { key: "postcode", label: "Postcode", aliases: ["post code", "zip", "postal code"] },
  { key: "businessNumber", label: "ABN", aliases: ["business number", "acn"] },
  { key: "accountNumber", label: "Account number", aliases: ["account", "account no", "acct", "customer number"] },
  { key: "paymentTermsDays", label: "Payment terms (days)", aliases: ["payment terms", "terms", "payment days"] },
  { key: "insuranceExpiry", label: "Insurance expiry", aliases: ["insurance", "insurance expires", "public liability expiry", "insurance expiry date"] },
  { key: "licenceNumber", label: "Licence number", aliases: ["licence", "license", "license number", "licence no"] },
  { key: "rating", label: "Rating", aliases: ["stars", "score"] },
  { key: "notes", label: "Notes", aliases: ["comments", "description"] },
];

export function validateContact(raw: Record<string, unknown>): Validated<ContactInput> {
  const errors: FieldErrors = {};
  const businessName = clean(raw.businessName);
  const name = clean(raw.name) ?? businessName;
  if (!name) errors.name = "Enter a name or business name.";
  else if (name.length > 120) errors.name = "Name is too long (120 characters max).";

  const email = clean(raw.email)?.toLowerCase() ?? null;
  validateEmail(email, errors);

  let businessNumber = clean(raw.businessNumber);
  if (businessNumber) {
    const abn = normaliseAbn(businessNumber);
    if (!abn) errors.businessNumber = "ABN must be 11 digits.";
    else businessNumber = abn;
  }

  let website = clean(raw.website);
  if (website) {
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
    try {
      const u = new URL(website);
      if (!u.hostname.includes(".")) throw new Error("no tld");
    } catch {
      errors.website = "Enter a valid website address.";
    }
  }

  const paymentTermsDays = validateDays(clean(raw.paymentTermsDays), errors, "paymentTermsDays", "Payment terms");

  const insRaw = clean(raw.insuranceExpiry);
  const insuranceExpiry = parseDateLoose(insRaw);
  if (insRaw && !insuranceExpiry) errors.insuranceExpiry = "Enter a valid date (e.g. 2026-06-30 or 30/06/2026).";

  const ratingRaw = clean(raw.rating);
  let rating: number | null = null;
  if (ratingRaw && ratingRaw !== "0") {
    const n = parseIntLoose(ratingRaw.replace(/\/\s*5$/, "").replace(/stars?/i, ""));
    if (n === null || Number.isNaN(n) || n < 1 || n > 5) errors.rating = "Rating must be from 1 to 5.";
    else rating = n;
  }

  const g = raw.groups;
  const groups = Array.isArray(g) ? [...new Set(g.map((x) => String(x).trim()).filter(Boolean))] : splitList(clean(g));

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      name: name!,
      businessName,
      contactType: clean(raw.contactType),
      groups,
      trade: clean(raw.trade),
      email,
      mobile: clean(raw.mobile),
      phone: clean(raw.phone),
      website,
      address: clean(raw.address),
      cityTown: clean(raw.cityTown),
      state: clean(raw.state)?.toUpperCase() ?? null,
      postcode: clean(raw.postcode),
      businessNumber,
      accountNumber: clean(raw.accountNumber),
      paymentTermsDays,
      insuranceExpiry,
      licenceNumber: clean(raw.licenceNumber),
      rating,
      notes: clean(raw.notes),
    },
  };
}

export type InsuranceStatus = { state: "none" | "ok" | "expiring" | "expired"; days: number | null };

/** Insurance expiry status relative to `today` (YYYY-MM-DD). Warning window is 30 days. */
export function insuranceStatus(expiry: string | null | undefined, today: string, warnDays = 30): InsuranceStatus {
  const e = parseDateLoose(expiry ?? null);
  if (!e) return { state: "none", days: null };
  const days = Math.round((Date.parse(e + "T00:00:00Z") - Date.parse(today.slice(0, 10) + "T00:00:00Z")) / 86_400_000);
  if (days < 0) return { state: "expired", days };
  if (days <= warnDays) return { state: "expiring", days };
  return { state: "ok", days };
}

export function insuranceLabel(s: InsuranceStatus): string {
  if (s.state === "expired") return s.days === -1 ? "Expired yesterday" : `Expired ${-s.days!} days ago`;
  if (s.state === "expiring") return s.days === 0 ? "Expires today" : s.days === 1 ? "Expires tomorrow" : `Expires in ${s.days} days`;
  if (s.state === "ok") return "Current";
  return "Not recorded";
}

export function stars(rating: number | null | undefined): string {
  const r = Math.max(0, Math.min(5, Math.round(rating ?? 0)));
  return "★".repeat(r) + "☆".repeat(5 - r);
}
