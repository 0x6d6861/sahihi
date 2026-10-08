"use client"

import type { NotificationType } from "@sahihi/core"
import { useState } from "react"
import { Panel } from "@/components/app/panel"
import { toastManager } from "@/components/app/toast"
import { Switch } from "@/components/arc/switch/switch"
import { api } from "@/lib/api"
import { groupPreferences, type NotificationPreference } from "@/lib/notifications"

/**
 * Settings → Notifications: one switch per type, saved as soon as it changes. Choices are per
 * workspace; members only see the types they can receive.
 */
export function NotificationPreferencesForm({ initial }: { initial: NotificationPreference[] }) {
  const [items, setItems] = useState(initial)
  const [saving, setSaving] = useState<NotificationType | null>(null)

  async function toggle(type: NotificationType, enabled: boolean) {
    const previous = items
    setItems((list) => list.map((i) => (i.type === type ? { ...i, enabled } : i)))
    setSaving(type)
    try {
      const saved = await api<{ items: NotificationPreference[] }>("/notifications/preferences", {
        method: "PUT",
        json: { settings: { [type]: enabled } },
      })
      setItems(saved.items)
    } catch {
      setItems(previous)
      toastManager.add({ title: "Couldn't save that change", type: "error" })
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {groupPreferences(items).map((group) => (
        <Panel key={group.group} title={group.title} description={group.description}>
          <ul className="flex flex-col divide-y">
            {group.items.map((item) => {
              const id = `notification-${item.type}`
              return (
                <li
                  key={item.type}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span id={id} className="font-medium text-sm">
                      {item.label}
                    </span>
                    <span className="text-muted-foreground text-sm">{item.description}</span>
                  </div>
                  <Switch
                    aria-labelledby={id}
                    checked={item.enabled}
                    disabled={saving === item.type}
                    onCheckedChange={(next) => toggle(item.type, next)}
                  />
                </li>
              )
            })}
          </ul>
        </Panel>
      ))}
    </div>
  )
}
