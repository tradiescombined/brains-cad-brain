/** Record types a reminder or activity entry can point at, and where each lives in the app. */
export const ENTITY_TYPES = [
  { value: "estimate", label: "Estimate" },
  { value: "job", label: "Job" },
  { value: "lead", label: "Lead" },
  { value: "client", label: "Client" },
  { value: "contact", label: "Supplier / trade" },
  { value: "invoice", label: "Invoice" },
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number]["value"];

const ROUTES: Record<string, string> = {
  estimate: "/estimates",
  job: "/jobs",
  lead: "/leads",
  client: "/clients",
  contact: "/contacts",
  invoice: "/invoices",
  order: "/orders",
};

export function entityHref(type: string | null | undefined, id: string | null | undefined): string | null {
  if (!type || !id) return null;
  const base = ROUTES[type];
  return base ? `${base}/${id}` : null;
}

export function entityTypeLabel(type: string | null | undefined): string {
  if (!type) return "";
  return ENTITY_TYPES.find((t) => t.value === type)?.label ?? type[0].toUpperCase() + type.slice(1);
}
