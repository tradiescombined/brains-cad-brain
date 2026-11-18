import { requirePermission } from "@/lib/permissions";

/** Permission gate for this section (see docs/PERMISSIONS.md). */
export default async function CataloguesGate({ children }: { children: React.ReactNode }) {
  await requirePermission("costs.view");
  return children;
}
