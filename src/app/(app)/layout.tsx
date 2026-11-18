import { redirect } from "next/navigation";
import { Sidebar } from "@/components/shell/Sidebar";
import { navFor } from "@/components/shell/nav";
import { getSettings } from "@/lib/settings";
import { currentPermissions, forbiddenUrl } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [s, perms] = await Promise.all([getSettings(), currentPermissions()]);
  if (!perms.user) redirect(forbiddenUrl(null));
  return (
    <div className="lg:flex">
      <Sidebar businessName={s.businessName} nav={navFor(perms)} userLabel={`${perms.user.firstName} · ${perms.role}`} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
