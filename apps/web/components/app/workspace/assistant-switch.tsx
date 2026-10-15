"use client"

import { useState } from "react"
import { toastManager } from "@/components/app/toast"
import { Switch } from "@/components/arc/switch/switch"
import { api } from "@/lib/api"

/**
 * The workspace's AI assistant on or off (PUT /api/generated-documents/settings, owners and
 * admins). It applies at once, so a switch, not a form; a failed change flips back.
 */
export function AssistantSwitch({ enabled: initial }: { enabled: boolean }) {
  const [enabled, setEnabled] = useState(initial)
  const [pending, setPending] = useState(false)

  async function change(next: boolean) {
    setEnabled(next)
    setPending(true)
    try {
      await api("/generated-documents/settings", { method: "PUT", json: { enabled: next } })
    } catch {
      setEnabled(!next)
      toastManager.add({ title: "Couldn't change the assistant setting", type: "error" })
    } finally {
      setPending(false)
    }
  }

  return (
    <Switch
      label="Let members draft documents with the AI assistant"
      checked={enabled}
      disabled={pending}
      onCheckedChange={(c) => void change(c === true)}
    />
  )
}
