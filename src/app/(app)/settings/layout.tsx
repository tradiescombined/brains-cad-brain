import { PageHeader } from "@/components/ui";
import { SettingsNav } from "./_components/SettingsNav";

export const metadata = { title: "Settings · Brains Cad Brain" };

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
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
