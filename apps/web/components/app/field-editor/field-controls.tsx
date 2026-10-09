"use client"

import type { FieldType } from "@sahihi/core"
import {
  AtSignIcon,
  CalendarIcon,
  CheckSquareIcon,
  PenLineIcon,
  SignatureIcon,
  Trash2Icon,
  TypeIcon,
  UserIcon,
} from "@/components/app/icons"
import { Button } from "@/components/arc/button/button"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Input } from "@/components/arc/input/input"
import { Label } from "@/components/ui/label"
// coss Select here (not Arc): each option shows its recipient's colour, and Arc's options are text only.
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FIELD_LABELS, RECIPIENT_COLORS } from "@/lib/constants"
import type { EditorField } from "@/lib/field-editor"
import { cn } from "@/lib/utils"
import type { EditorRecipient } from "./context"
import { useFieldEditor } from "./context"
import type { AutosaveStatus } from "./use-autosave"

/** Controls of the field tools (`FieldPalette`) and the preview step. */

export const FIELD_ICONS: Record<FieldType, React.ComponentType<{ "aria-hidden"?: boolean }>> = {
  SIGNATURE: SignatureIcon,
  INITIALS: PenLineIcon,
  DATE_SIGNED: CalendarIcon,
  NAME: UserIcon,
  EMAIL: AtSignIcon,
  TEXT: TypeIcon,
  CHECKBOX: CheckSquareIcon,
}

export const STATUS_TEXT: Record<AutosaveStatus, string> = {
  saved: "All changes saved",
  pending: "Unsaved changes",
  saving: "Saving…",
  error: "Couldn't save",
}

export function RecipientDot({ colorIndex }: { colorIndex: number }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-full border-2",
        RECIPIENT_COLORS[colorIndex % RECIPIENT_COLORS.length],
      )}
    />
  )
}

export function RecipientSelect({
  recipients,
  value,
  onChange,
  className,
  size = "sm",
}: {
  recipients: EditorRecipient[]
  value: string | null
  onChange: (id: string) => void
  className?: string
  size?: "sm" | "default"
}) {
  const items = recipients.map((r) => ({ value: r.id, label: r.name }))
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(v) => {
        if (v) onChange(String(v))
      }}
    >
      <SelectTrigger className={className} size={size} aria-label="Recipient">
        <SelectValue placeholder="Recipient" />
      </SelectTrigger>
      <SelectPopup>
        {recipients.map((r) => (
          <SelectItem key={r.id} value={r.id}>
            <span className="flex items-center gap-2">
              <RecipientDot colorIndex={r.colorIndex} />
              {r.name}
            </span>
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  )
}

/** Settings of one placed field: owner, label, required, delete. */
export function FieldSettingsForm({
  field,
  recipients,
}: {
  field: EditorField
  recipients: EditorRecipient[]
}) {
  const { dispatch, recipients: byId } = useFieldEditor()
  if (field.locked) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p>
          {field.label || FIELD_LABELS[field.type]} for{" "}
          {byId.get(field.recipientId)?.name ?? "a recipient"}
          {field.required ? ", required" : ""}.
        </p>
        <p className="text-muted-foreground">
          Placed from the AI draft, on the line the document prints, so it can't move or change
          here. To change it, start a new version of the draft.
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Recipient</Label>
        <RecipientSelect
          className="w-full"
          size="default"
          recipients={recipients}
          value={field.recipientId}
          onChange={(recipientId) =>
            dispatch({ type: "update", key: field.key, patch: { recipientId } })
          }
        />
      </div>
      <Input
        label="Label (optional)"
        value={field.label ?? ""}
        maxLength={120}
        placeholder={FIELD_LABELS[field.type]}
        onChange={(e) =>
          dispatch({ type: "update", key: field.key, patch: { label: e.target.value } })
        }
      />
      <Checkbox
        label="Required"
        checked={field.required}
        onCheckedChange={(required) =>
          dispatch({ type: "update", key: field.key, patch: { required: required === true } })
        }
      />
      <Button
        variant="danger"
        size="sm"
        onClick={() => dispatch({ type: "delete", key: field.key })}
      >
        <Trash2Icon aria-hidden />
        Delete field
      </Button>
    </div>
  )
}

/** Autosave state with a Retry after a failed save. */
export function SaveStatus({ status, onRetry }: { status?: AutosaveStatus; onRetry?: () => void }) {
  if (!status) return null
  return (
    <>
      <span aria-live="polite" className={cn(status === "error" && "text-destructive-foreground")}>
        {STATUS_TEXT[status]}
      </span>
      {status === "error" && onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </>
  )
}
