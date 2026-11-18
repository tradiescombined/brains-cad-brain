import { PageHeader } from "@/components/ui";
import { SettingsNav } from "./_components/SettingsNav";
import { requirePermission } from "@/lib/permissions";

export const metadata = { title: "Settings · Brains Cad Brain" };

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("settings.manage");
  return (
    <div>
      <PageHeader title="Settings" subtitle="Set up your business, team and defaults." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15rem_1fr]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <SettingsNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
