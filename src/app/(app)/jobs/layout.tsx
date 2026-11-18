import { requirePermission } from "@/lib/permissions";

/** Permission gate for this section (see docs/PERMISSIONS.md). */
export default async function JobsGate({ children }: { children: React.ReactNode }) {
  await requirePermission("jobs.view");
  return children;
}
