"use client"

import { RETENTION_YEARS, type RetentionYears, retentionLabel } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toastManager } from "@/components/app/toast"
import { Button } from "@/components/arc/button/button"
import { Select } from "@/components/arc/select/select"
import { api } from "@/lib/api"

const key = (y: RetentionYears) => (y === null ? "forever" : String(y))
const fromKey = (k: string): RetentionYears =>
  k === "forever" ? null : (Number(k) as RetentionYears)

/** Retention period for closed envelopes (docs/data-retention.md). */
export function RetentionForm({ initial }: { initial: RetentionYears }) {
  const router = useRouter()
  const [value, setValue] = useState(key(initial))
  const [saving, setSaving] = useState(false)
  const items = RETENTION_YEARS.map((y) => ({ value: key(y), label: retentionLabel(y) }))

  async function save() {
    setSaving(true)
    try {
      await api("/data/settings", { method: "PUT", json: { retentionYears: fromKey(value) } })
      // Confirmed in place: the page refreshes with the saved value, which disables Save again.
      router.refresh()
    } catch (err) {
      toastManager.add({
        title: "Not saved",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="sm:max-w-sm">
        <Select
          label="Delete envelope files and personal data"
          options={items}
          value={value}
          onValueChange={setValue}
          description="Applies to completed, declined, voided and expired envelopes. PDFs, signatures and recipients' details are deleted; the status, hashes, certificate code and audit trail are kept as evidence. Runs nightly."
        />
      </div>
      <div>
        <Button
          variant="secondary"
          onClick={save}
          loading={saving}
          disabled={value === key(initial)}
        >
          Save
        </Button>
      </div>
    </div>
  )
}
