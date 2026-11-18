import { requirePermission } from "@/lib/permissions";

/** Permission gate for this section (see docs/PERMISSIONS.md). */
export default async function JobVariationsGate({ children }: { children: React.ReactNode }) {
  await requirePermission("invoices.view");
  return children;
}
