"use client"

import { RETENTION_YEARS, type RetentionYears, retentionLabel } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { toastManager } from "@/components/ui/toast"
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
      toastManager.add({ title: "Retention saved", type: "success" })
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
      <Field>
        <FieldLabel>Delete envelope files and personal data</FieldLabel>
        <Select items={items} value={value} onValueChange={(v) => v && setValue(String(v))}>
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {items.map((it) => (
              <SelectItem key={it.value} value={it.value}>
                {it.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <FieldDescription>
          Applies to completed, declined, voided and expired envelopes. PDFs, signatures and
          recipients' details are deleted; the status, hashes, certificate code and audit trail are
          kept as evidence. Runs nightly.
        </FieldDescription>
      </Field>
      <div>
        <Button onClick={save} disabled={saving || value === key(initial)}>
          {saving && <Spinner aria-hidden />}
          Save
        </Button>
      </div>
    </div>
  )
}
