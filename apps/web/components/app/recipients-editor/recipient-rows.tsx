"use client"

import {
  RECIPIENT_ROLES,
  type RecipientRole,
  VERIFICATION_METHODS,
  type VerificationMethod,
} from "@sahihi/core"
import { Trash2Icon } from "@/components/app/icons"
import { Input } from "@/components/arc/input/input"
import { NumberField } from "@/components/arc/number-field/number-field"
import { Select } from "@/components/arc/select/select"
import { Button } from "@/components/ui/button"
import { RECIPIENT_COLORS } from "@/lib/constants"
import type { FormErrors } from "@/lib/envelope-form"
import { type RecipientRow, ROLE_LABELS, VERIFICATION_LABELS } from "@/lib/recipients"
import { cn } from "@/lib/utils"

export const MAX_RECIPIENTS = 50
const roleItems = RECIPIENT_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }))
const verificationItems = VERIFICATION_METHODS.map((value) => ({
  value,
  label: VERIFICATION_LABELS[value],
}))

/**
 * The recipient rows, controlled, for the draft editor's `RecipientsEditor`. `errors` is keyed
 * `recipients.<i>.<field>`, the paths the API and `validateRecipients` report errors on.
 * Row colours match the field editor: `RECIPIENT_COLORS[index % 5]` (the API sets colorIndex = index).
 * `stacked` keeps one column for narrow containers.
 */
export function RecipientRows({
  rows,
  onChange,
  onRemove,
  sequential,
  errors,
  stacked = false,
}: {
  rows: RecipientRow[]
  onChange: (key: string, patch: Partial<RecipientRow>) => void
  onRemove: (key: string) => void
  sequential: boolean
  errors: FormErrors
  stacked?: boolean
}) {
  return (
    <ol className="flex flex-col gap-3">
      {rows.map((r, i) => {
        const base = `recipients.${i}`
        return (
          <li key={r.key} className="flex flex-col gap-4 border-t pt-5 first:border-t-0 first:pt-0">
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
                onClick={() => onRemove(r.key)}
              >
                <Trash2Icon aria-hidden />
              </Button>
            </div>

            <RecipientFields
              row={r}
              base={base}
              errors={errors}
              onChange={(patch) => onChange(r.key, patch)}
              sequential={sequential}
              stacked={stacked}
            />
          </li>
        )
      })}
    </ol>
  )
}

/** One recipient's inputs (name, email, role, verification, step, phone); errors at `${base}.<field>`. */
function RecipientFields({
  row,
  base,
  errors,
  onChange,
  sequential,
  stacked = false,
}: {
  row: RecipientRow
  base: string
  errors: FormErrors
  onChange: (patch: Partial<RecipientRow>) => void
  sequential: boolean
  stacked?: boolean
}) {
  const error = (field: string) => errors[`${base}.${field}`]
  return (
    <div className={cn("grid gap-4", !stacked && "sm:grid-cols-2")}>
      <Input
        label="Name"
        name={`${base}.name`}
        value={row.name}
        maxLength={120}
        autoComplete="off"
        error={error("name")}
        onChange={(e) => onChange({ name: e.target.value })}
      />
      <Input
        label="Email"
        name={`${base}.email`}
        type="email"
        value={row.email}
        autoComplete="off"
        error={error("email")}
        onChange={(e) => onChange({ email: e.target.value })}
      />

      <Select
        label="Role"
        options={roleItems}
        value={row.role}
        onValueChange={(v) => v && onChange({ role: v as RecipientRole })}
        description={row.role === "VIEWER" ? "Viewers get a copy and can't own fields." : undefined}
      />

      <Select
        label="Verification"
        options={verificationItems}
        value={row.verification}
        onValueChange={(v) => v && onChange({ verification: v as VerificationMethod })}
      />

      {sequential && (
        <div className="flex flex-col gap-1.5">
          <NumberField
            label="Signing step"
            value={row.order}
            min={1}
            max={MAX_RECIPIENTS}
            onValueChange={(v) => onChange({ order: v || 1 })}
            description="Recipients with the same step sign in parallel."
          />
          {error("order") && (
            <p role="alert" className="text-destructive-foreground text-sm">
              {error("order")}
            </p>
          )}
        </div>
      )}

      {(row.verification === "SMS_OTP" || row.phone) && (
        <Input
          label={`Mobile number${row.verification === "SMS_OTP" ? "" : " (optional)"}`}
          name={`${base}.phone`}
          type="tel"
          inputMode="tel"
          value={row.phone}
          placeholder="+254712345678"
          autoComplete="off"
          description="International format, starting with +."
          error={error("phone")}
          onChange={(e) => onChange({ phone: e.target.value })}
        />
      )}
    </div>
  )
}
