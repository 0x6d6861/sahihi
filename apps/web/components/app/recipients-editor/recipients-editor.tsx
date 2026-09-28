"use client"

import {
  RECIPIENT_ROLES,
  type RecipientRole,
  type SigningOrder,
  VERIFICATION_METHODS,
  type VerificationMethod,
} from "@sahihi/core"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useRegisterDraftEditor } from "@/components/app/envelope/draft-state"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Form } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@/components/ui/number-field"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toastManager } from "@/components/ui/toast"
import { ApiError, api } from "@/lib/api"
import { RECIPIENT_COLORS } from "@/lib/constants"
import type { FormErrors } from "@/lib/envelope-form"
import { issuesToFormErrors } from "@/lib/envelope-form"
import {
  emptyRow,
  nextOrder,
  type RecipientRow,
  ROLE_LABELS,
  rowsFromSaved,
  type SavedRecipient,
  VERIFICATION_LABELS,
  validateRecipients,
} from "@/lib/recipients"
import { cn } from "@/lib/utils"

const MAX_RECIPIENTS = 50
const roleItems = RECIPIENT_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }))
const verificationItems = VERIFICATION_METHODS.map((value) => ({
  value,
  label: VERIFICATION_LABELS[value],
}))

/**
 * Draft-only editor for `PUT /envelopes/:id/recipients` (replaces the whole list).
 * Row colours match the field editor: `RECIPIENT_COLORS[index % 5]` (the API sets colorIndex = index).
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
  const [dirty, setDirty] = useState(initial.length === 0)
  const [pending, setPending] = useState(false)
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
      setDirty(false)
      toastManager.add({ title: "Recipients saved", type: "success" })
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
    <Form className="flex flex-col gap-4" errors={errors} onSubmit={onSubmit}>
      {errors.recipients && (
        <Alert variant="error">
          <AlertDescription>Add at least one recipient.</AlertDescription>
        </Alert>
      )}

      <ol className="flex flex-col gap-3">
        {rows.map((r, i) => {
          const base = `recipients.${i}`
          return (
            <li key={r.key} className="flex flex-col gap-4 rounded-xl border p-4">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "size-3 rounded-full border-2",
                    RECIPIENT_COLORS[i % RECIPIENT_COLORS.length],
                  )}
                />
                <span className="font-medium text-sm">Recipient {i + 1}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ml-auto"
                  aria-label={`Remove recipient ${i + 1}`}
                  disabled={rows.length === 1}
                  onClick={() => remove(r.key)}
                >
                  <Trash2Icon aria-hidden />
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field name={`${base}.name`}>
                  <FieldLabel>Name</FieldLabel>
                  <Input
                    value={r.name}
                    maxLength={120}
                    autoComplete="off"
                    onChange={(e) => update(r.key, { name: e.target.value })}
                  />
                  <FieldError />
                </Field>
                <Field name={`${base}.email`}>
                  <FieldLabel>Email</FieldLabel>
                  <Input
                    type="email"
                    value={r.email}
                    autoComplete="off"
                    onChange={(e) => update(r.key, { email: e.target.value })}
                  />
                  <FieldError />
                </Field>

                <Field name={`${base}.role`}>
                  <FieldLabel>Role</FieldLabel>
                  <Select
                    items={roleItems}
                    value={r.role}
                    onValueChange={(v) => v && update(r.key, { role: v as RecipientRole })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      {roleItems.map((it) => (
                        <SelectItem key={it.value} value={it.value}>
                          {it.label}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                  {r.role === "VIEWER" && (
                    <FieldDescription>Viewers get a copy and can't own fields.</FieldDescription>
                  )}
                </Field>

                <Field name={`${base}.verification`}>
                  <FieldLabel>Verification</FieldLabel>
                  <Select
                    items={verificationItems}
                    value={r.verification}
                    onValueChange={(v) =>
                      v && update(r.key, { verification: v as VerificationMethod })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      {verificationItems.map((it) => (
                        <SelectItem key={it.value} value={it.value}>
                          {it.label}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </Field>

                {sequential && (
                  <Field name={`${base}.order`}>
                    <FieldLabel>Signing step</FieldLabel>
                    <NumberField
                      value={r.order}
                      min={1}
                      max={MAX_RECIPIENTS}
                      onValueChange={(v) => update(r.key, { order: v ?? 1 })}
                    >
                      <NumberFieldGroup>
                        <NumberFieldDecrement aria-label="Earlier step" />
                        <NumberFieldInput />
                        <NumberFieldIncrement aria-label="Later step" />
                      </NumberFieldGroup>
                    </NumberField>
                    <FieldDescription>
                      Recipients with the same step sign in parallel.
                    </FieldDescription>
                    <FieldError />
                  </Field>
                )}

                {(r.verification === "SMS_OTP" || r.phone) && (
                  <Field name={`${base}.phone`}>
                    <FieldLabel>
                      Mobile number{r.verification === "SMS_OTP" ? "" : " (optional)"}
                    </FieldLabel>
                    <Input
                      type="tel"
                      inputMode="tel"
                      value={r.phone}
                      placeholder="+254712345678"
                      autoComplete="off"
                      onChange={(e) => update(r.key, { phone: e.target.value })}
                    />
                    <FieldDescription>International format, starting with +.</FieldDescription>
                    <FieldError />
                  </Field>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={add}
          disabled={rows.length >= MAX_RECIPIENTS}
        >
          <PlusIcon aria-hidden />
          Add recipient
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm" aria-live="polite">
            {dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <Button type="submit" disabled={pending || !dirty}>
            {pending ? "Saving…" : "Save recipients"}
          </Button>
        </div>
      </div>
    </Form>
  )
}
