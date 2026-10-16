"use client"

import type { SigningOrder } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/app/button"
import { useRegisterDraftEditor } from "@/components/app/envelope/draft-state"
import { UserPlusIcon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { Alert } from "@/components/arc/alert/alert"
import { ApiError, api } from "@/lib/api"
import type { FormErrors } from "@/lib/envelope-form"
import { issuesToFormErrors } from "@/lib/envelope-form"
import {
  emptyRow,
  nextOrder,
  type RecipientRow,
  rowsFromSaved,
  type SavedRecipient,
  validateRecipients,
} from "@/lib/recipients"
import { MAX_RECIPIENTS, RecipientRows } from "./recipient-rows"

/**
 * Draft-only editor for `PUT /envelopes/:id/recipients` (replaces the whole list). The rows
 * themselves are `RecipientRows`.
 */
export function RecipientsEditor({
  envelopeId,
  signingOrder,
  initial,
}: {
  envelopeId: string
  signingOrder: SigningOrder
  initial: SavedRecipient[]
}) {
  const router = useRouter()
  const sequential = signingOrder === "SEQUENTIAL"
  const [rows, setRows] = useState<RecipientRow[]>(() =>
    initial.length > 0 ? rowsFromSaved(initial) : [emptyRow(1)],
  )
  const [errors, setErrors] = useState<FormErrors>({})
  // A new envelope's blank row isn't a change: nothing to lose, and Send's preflight then says
  // what's really missing ("Add a recipient") instead of "Save your changes".
  const [dirty, setDirty] = useState(false)
  const blank = initial.length === 0 && !dirty
  const [pending, setPending] = useState(false)
  // Saved changes made elsewhere (turning "sign in order" on renumbers the steps) show here too,
  // unless there are edits of this form's own to keep.
  const savedKey = JSON.stringify(initial)
  const [loadedKey, setLoadedKey] = useState(savedKey)
  useEffect(() => {
    if (savedKey === loadedKey || dirty) return
    setLoadedKey(savedKey)
    if (initial.length > 0) setRows(rowsFromSaved(initial))
  }, [savedKey, loadedKey, dirty, initial])
  useRegisterDraftEditor("recipients", {
    unsavedMessage: () => (dirty ? "Save your recipient changes first." : null),
  })

  function update(key: string, patch: Partial<RecipientRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
    setDirty(true)
  }
  function add() {
    setRows((rs) => [...rs, emptyRow(nextOrder(rs))])
    setDirty(true)
  }
  function remove(key: string) {
    setRows((rs) => rs.filter((r) => r.key !== key))
    setErrors({}) // indexes shift, so old error keys no longer line up
    setDirty(true)
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const result = validateRecipients(rows, signingOrder)
    if (!result.ok) return setErrors(result.errors)
    setErrors({})
    setPending(true)
    try {
      const { recipients } = await api<{ recipients: SavedRecipient[] }>(
        `/envelopes/${envelopeId}/recipients`,
        { method: "PUT", json: result.body },
      )
      setRows(rowsFromSaved(recipients))
      // Confirmed in place: the status beside the button reads "All changes saved".
      setDirty(false)
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError && err.body?.issues?.length) {
        setErrors(issuesToFormErrors(err.body.issues))
      } else {
        toastManager.add({
          title: "Could not save recipients",
          description: err instanceof Error ? err.message : "Please try again.",
          type: "error",
        })
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="flex flex-col gap-3" noValidate onSubmit={onSubmit}>
      {errors.recipients && <Alert tone="danger" title="Add at least one recipient." />}

      <RecipientRows
        rows={rows}
        errors={errors}
        onChange={update}
        onRemove={remove}
        sequential={sequential}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={add}
          disabled={rows.length >= MAX_RECIPIENTS}
        >
          <UserPlusIcon aria-hidden />
          Add recipient
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm" aria-live="polite">
            {blank ? null : dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <Button type="submit" size="sm" loading={pending} disabled={!dirty && !blank}>
            Save recipients
          </Button>
        </div>
      </div>
    </form>
  )
}
