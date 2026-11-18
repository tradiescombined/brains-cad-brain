import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { ActionForm, FormFooter } from "../_components/ActionForm";
import { saveDisplay } from "../actions";

export const metadata = { title: "Display preferences · Settings" };

function Toggle({ name, label, desc, checked }: { name: string; label: string; desc: string; checked: boolean }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 px-4 py-3 hover:bg-ink-50">
      <span>
        <span className="block text-sm font-medium text-ink-900">{label}</span>
        <span className="block text-xs text-ink-500">{desc}</span>
      </span>
      <input type="checkbox" name={name} defaultChecked={checked} aria-label={label} className="mt-1 size-4 shrink-0 accent-brand-600" />
    </label>
  );
}

export default async function DisplayPage() {
  const s = await getSettings();
  return (
    <ActionForm action={saveDisplay} aria-label="Display preferences" className="rounded-lg border border-ink-200 bg-white shadow-xs">
      <header className="border-b border-ink-100 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Dashboard panels</h2>
        <p className="mt-0.5 text-xs text-ink-500">
          Choose what appears on your <Link href="/dashboard" className="text-brand-700 hover:underline">dashboard</Link>. Key figures, reminders and activity always show.
        </p>
      </header>
      <div className="divide-y divide-ink-100">
        <Toggle name="showDashboardQuickStart" label="Getting started checklist" desc="Five setup steps that tick themselves off as you use the app." checked={s.showDashboardQuickStart} />
        <Toggle name="showDashboardEstimateSummary" label="Estimate summary" desc="Count and value of estimates in each status." checked={s.showDashboardEstimateSummary} />
      </div>
      <FormFooter label="Save preferences" className="border-t border-ink-100 px-4 py-3" />
    </ActionForm>
  );
}
