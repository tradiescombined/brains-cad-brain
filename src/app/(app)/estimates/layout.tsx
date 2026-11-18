import { requirePermission } from "@/lib/permissions";

/** Permission gate for this section (see docs/PERMISSIONS.md). */
export default async function EstimatesGate({ children }: { children: React.ReactNode }) {
  await requirePermission("estimates.view");
  return children;
}
