import { redirect } from "next/navigation";
import { Sidebar } from "@/components/shell/Sidebar";
import { navFor } from "@/components/shell/nav";
import { authBypassEnabled } from "@/lib/auth-bypass";
import { getSettings } from "@/lib/settings";
import { currentPermissions } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [s, perms] = await Promise.all([getSettings(), currentPermissions()]);
  const bypass = authBypassEnabled();
  // The proxy already requires a session + linked active user; this is the backstop for pages.
  if (!perms.user) redirect("/no-access");
  const u = perms.user;
  const signedIn = { name: [u.firstName, u.surname].filter(Boolean).join(" "), role: u.role, email: u.email };
  return (
    <div className="lg:flex">
      <Sidebar businessName={s.businessName} nav={navFor(perms)} user={signedIn} showUserButton={!bypass} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
