"use client"

import {
  RECIPIENT_ROLES,
  type RecipientRole,
  VERIFICATION_METHODS,
  type VerificationMethod,
} from "@sahihi/core"
import { useId } from "react"
import { Input } from "@/components/app/fields"
import { Trash2Icon } from "@/components/app/icons"
import { Button } from "@/components/ui/button"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
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

/** Filled cells, as in the design's table: no edge, a muted fill. */
const CELL = "rounded-2xl border-transparent bg-muted shadow-none dark:bg-muted"

/**
 * The recipient rows, controlled, for the draft editor's `RecipientsEditor`. `errors` is keyed
 * `recipients.<i>.<field>`, the paths the API and `validateRecipients` report errors on.
 * Row colours match the field editor: `RECIPIENT_COLORS[index % 5]` (the API sets colorIndex = index).
 * From `md` (unless `stacked`) the rows are a table: step, name, email, role, verification, remove,
 * with the column names in a header row; below that each recipient is a card with labelled fields.
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
  const table = !stacked
  // One column template for the header and every row, so the cells line up.
  const columns = sequential
    ? "md:grid-cols-[44px_minmax(0,1fr)_minmax(0,250px)_180px_180px_32px]"
    : "md:grid-cols-[minmax(0,1fr)_minmax(0,250px)_180px_180px_32px]"
  return (
    <div className="overflow-hidden rounded-(--radius-panel) border bg-card">
      {table && (
        <div
          aria-hidden
          className={cn(
            "app-canvas hidden gap-3 border-b px-4 py-3 font-medium text-muted-foreground text-xs md:grid",
            columns,
          )}
        >
          {sequential && <span>Step</span>}
          <span className="pl-4">Name</span>
          <span>Email</span>
          <span>Role</span>
          <span>Verification</span>
        </div>
      )}
      <ol className="flex flex-col divide-y">
        {rows.map((r, i) => {
          const base = `recipients.${i}`
          const error = (field: string) => errors[`${base}.${field}`]
          const who = r.name.trim() || `recipient ${i + 1}`
          return (
            <li
              key={r.key}
              aria-label={r.name.trim() || `Recipient ${i + 1}`}
              className={cn(
                "grid gap-3 px-4 py-3.5",
                table ? cn("md:items-start", columns) : "sm:grid-cols-2",
              )}
            >
              {sequential && (
                <div>
                  <Input
                    label="Signing step"
                    labelClassName={table ? "md:sr-only" : undefined}
                    name={`${base}.order`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_RECIPIENTS}
                    value={String(r.order)}
                    error={error("order")}
                    className={cn(
                      CELL,
                      "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none",
                      table && "md:px-0 md:text-center",
                    )}
                    onChange={(e) => onChange(r.key, { order: Number(e.target.value) || 1 })}
                  />
                </div>
              )}
              <div className="flex items-start gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "mt-[11px] size-2.5 shrink-0 rounded-full border-2 max-md:hidden",
                    !table && "hidden",
                    RECIPIENT_COLORS[i % RECIPIENT_COLORS.length],
                  )}
                />
                <div className="min-w-0 flex-1">
                  <Input
                    label="Name"
                    labelClassName={table ? "md:sr-only" : undefined}
                    name={`${base}.name`}
                    value={r.name}
                    maxLength={120}
                    autoComplete="off"
                    placeholder="Full name"
                    error={error("name")}
                    className={CELL}
                    onChange={(e) => onChange(r.key, { name: e.target.value })}
                  />
                </div>
              </div>
              <Input
                label="Email"
                labelClassName={table ? "md:sr-only" : undefined}
                name={`${base}.email`}
                type="email"
                value={r.email}
                autoComplete="off"
                placeholder="name@company.com"
                error={error("email")}
                className={CELL}
                onChange={(e) => onChange(r.key, { email: e.target.value })}
              />
              <CellSelect
                label="Role"
                hideLabel={table}
                items={roleItems}
                value={r.role}
                onValueChange={(v) => onChange(r.key, { role: v as RecipientRole })}
                description={
                  r.role === "VIEWER" ? "Viewers get a copy and can't own fields." : undefined
                }
              />
              <CellSelect
                label="Verification"
                hideLabel={table}
                items={verificationItems}
                value={r.verification}
                onValueChange={(v) => onChange(r.key, { verification: v as VerificationMethod })}
              />
              <div className={cn("flex justify-end", table && "md:pt-0.5")}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  aria-label={`Remove ${who}`}
                  disabled={rows.length === 1}
                  onClick={() => onRemove(r.key)}
                >
                  <Trash2Icon aria-hidden />
                </Button>
              </div>
              {(r.verification === "SMS_OTP" || r.phone) && (
                <div className={cn("sm:col-span-2", table && "md:col-span-full md:max-w-sm")}>
                  <Input
                    label={`Mobile number${r.verification === "SMS_OTP" ? "" : " (optional)"}`}
                    name={`${base}.phone`}
                    type="tel"
                    inputMode="tel"
                    value={r.phone}
                    placeholder="+254712345678"
                    autoComplete="off"
                    description="International format, starting with +."
                    error={error("phone")}
                    className={CELL}
                    onChange={(e) => onChange(r.key, { phone: e.target.value })}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** A coss select in a table cell: its label only for assistive tech there, shown in a card. */
function CellSelect({
  label,
  hideLabel,
  items,
  value,
  onValueChange,
  description,
}: {
  label: string
  hideLabel: boolean
  items: { value: string; label: string }[]
  value: string
  onValueChange: (value: string) => void
  description?: string
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <span id={id} className={cn("font-medium text-sm leading-none", hideLabel && "md:sr-only")}>
        {label}
      </span>
      <Select items={items} value={value} onValueChange={(v) => v && onValueChange(String(v))}>
        <SelectTrigger aria-labelledby={id} className={cn("w-full", CELL)}>
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
      {description && <p className="text-muted-foreground text-xs">{description}</p>}
    </div>
  )
}
