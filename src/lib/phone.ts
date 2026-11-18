/**
 * Phone numbers with an optional country dialling code (pure, client + server safe).
 *
 * Numbers in the business's home country are stored exactly as typed ("0412 345 678").
 * Numbers for another country are stored with their code in front ("+64 21 123 4567"),
 * so existing data and plain local numbers keep working unchanged.
 */

export const DIAL_CODES: { code: string; country: string; label: string }[] = [
  { code: "+61", country: "AU", label: "Australia" },
  { code: "+64", country: "NZ", label: "New Zealand" },
  { code: "+1", country: "US", label: "United States / Canada" },
  { code: "+44", country: "GB", label: "United Kingdom" },
  { code: "+353", country: "IE", label: "Ireland" },
  { code: "+65", country: "SG", label: "Singapore" },
  { code: "+852", country: "HK", label: "Hong Kong" },
  { code: "+63", country: "PH", label: "Philippines" },
  { code: "+91", country: "IN", label: "India" },
  { code: "+86", country: "CN", label: "China" },
  { code: "+27", country: "ZA", label: "South Africa" },
  { code: "+679", country: "FJ", label: "Fiji" },
  { code: "+675", country: "PG", label: "Papua New Guinea" },
];

/** Home dialling code for the business country ("Australia" → "+61"); defaults to +61. */
export function dialCodeForCountry(country: string | null | undefined): string {
  const c = (country ?? "").trim().toLowerCase();
  if (!c) return "+61";
  const hit = DIAL_CODES.find((d) => d.label.toLowerCase() === c || d.country.toLowerCase() === c || d.label.toLowerCase().split(" / ").includes(c));
  return hit?.code ?? "+61";
}

const isKnown = (code: string) => DIAL_CODES.some((d) => d.code === code);

/** Split a stored number into its dialling code and the rest. */
export function splitPhone(value: string | null | undefined, defaultDial = "+61"): { dial: string; national: string } {
  const v = (value ?? "").trim();
  if (!v.startsWith("+")) return { dial: defaultDial, national: v };
  // Longest known code that prefixes the number wins (+852 before +85…).
  const compact = v.replace(/[\s()-]/g, "");
  const match = [...DIAL_CODES].sort((a, b) => b.code.length - a.code.length).find((d) => compact.startsWith(d.code));
  if (!match) return { dial: defaultDial, national: v };
  let rest = v.slice(1);
  for (const ch of match.code.slice(1)) rest = rest.replace(new RegExp(`^[\\s()-]*${ch}`), "");
  return { dial: match.code, national: rest.replace(/^[\s()-]+/, "") };
}

/** Combine a dialling code and number for storage (home-country numbers stay as typed). */
export function joinPhone(dial: string, national: string, defaultDial = "+61"): string {
  const n = national.trim();
  if (!n) return "";
  if (n.startsWith("+")) return n;
  if (!dial || dial === defaultDial || !isKnown(dial)) return n;
  return `${dial} ${n.replace(/^0+/, "")}`;
}

/** `tel:` link in international format, e.g. tel:+61412345678. */
export function telHref(value: string | null | undefined, defaultDial = "+61"): string {
  const { dial, national } = splitPhone(value, defaultDial);
  const digits = national.replace(/[^\d]/g, "").replace(/^0+/, "");
  return digits ? `tel:${dial}${digits}` : "";
}
