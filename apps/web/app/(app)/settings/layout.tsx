import { SettingsTabs } from "@/components/app/settings/settings-tabs"

/** Workspace settings: Members and Webhooks share one header and tab bar. */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="font-semibold text-xl">Settings</h1>
        <SettingsTabs />
      </div>
      {children}
    </div>
  )
}
