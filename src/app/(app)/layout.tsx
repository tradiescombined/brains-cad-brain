import { redirect } from "next/navigation";
import { Sidebar } from "@/components/shell/Sidebar";
import { getCurrentUser } from "@/lib/auth";
import { authBypassEnabled } from "@/lib/auth-bypass";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [s, user] = await Promise.all([getSettings(), getCurrentUser()]);
  const bypass = authBypassEnabled();
  // The proxy already requires a session + linked user; this is the backstop for pages.
  if (!user && !bypass) redirect("/no-access");
  const signedIn = user
    ? { name: [user.firstName, user.surname].filter(Boolean).join(" "), role: user.role, email: user.email }
    : null;
  return (
    <div className="lg:flex">
      <Sidebar businessName={s.businessName} user={signedIn} showUserButton={!bypass} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
