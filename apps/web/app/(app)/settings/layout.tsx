import { SettingsNav } from "@/components/app/settings/settings-nav"
import { SettingsTabs } from "@/components/app/settings/settings-tabs"

/**
 * Every settings page shares one header and navigation: a grouped side nav on wide screens, the
 * tab bar below `lg` (ADR 0055).
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-x-10">
      <h1 className="font-medium text-2xl tracking-tight lg:col-span-2">Settings</h1>
      <div className="lg:hidden">
        <SettingsTabs />
      </div>
      <aside className="max-lg:hidden">
        <div className="sticky top-24">
          <SettingsNav />
        </div>
      </aside>
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
    </div>
  )
}
