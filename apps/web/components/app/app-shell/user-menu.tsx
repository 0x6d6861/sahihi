"use client"

import { Settings02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { applyThemePreference, currentThemePreference } from "@/components/app/theme"
import { UserMenu as ArcUserMenu } from "@/components/arc/user-menu/user-menu"
import { signOut } from "@/lib/auth-client"
import { SETTINGS_NAV } from "@/lib/nav"
import type { ThemePreference } from "@/lib/theme"

export interface ShellUser {
  name: string
  email: string
  image?: string | null
}

/**
 * Account menu at the right of the top bar (avatar only): Settings (the only way in, ADR 0026),
 * appearance (light, dark, system) and sign out.
 */
export function UserMenu({ user }: { user: ShellUser }) {
  const router = useRouter()
  const [theme, setTheme] = useState<ThemePreference>("system")

  // The preference is on <html>, which only exists in the browser; read it after mount.
  useEffect(() => setTheme(currentThemePreference()), [])

  function onThemeChange(next: ThemePreference) {
    setTheme(next)
    applyThemePreference(next)
  }

  async function onSignOut() {
    await signOut()
    router.push("/sign-in")
    router.refresh()
  }

  return (
    <ArcUserMenu
      user={{
        name: user.name || user.email,
        email: user.email,
        avatarSrc: user.image ?? undefined,
      }}
      theme={theme}
      onThemeChange={onThemeChange}
      items={[
        {
          label: "Settings",
          icon: <HugeiconsIcon icon={Settings02Icon} size={16} strokeWidth={1.75} aria-hidden />,
          onSelect: () => router.push(SETTINGS_NAV[0].href),
        },
      ]}
      onSignOut={onSignOut}
      align="end"
      showName={false}
    />
  )
}
