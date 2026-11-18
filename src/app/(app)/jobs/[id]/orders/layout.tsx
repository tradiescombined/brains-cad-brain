import { requirePermission } from "@/lib/permissions";

/** Permission gate for this section (see docs/PERMISSIONS.md). */
export default async function JobOrdersGate({ children }: { children: React.ReactNode }) {
  await requirePermission("orders.view");
  return children;
}
