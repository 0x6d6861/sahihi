"use client"

import { FIELD_TYPES, type FieldType } from "@sahihi/core"
import {
  AtSignIcon,
  CalendarIcon,
  CheckSquareIcon,
  MousePointer2Icon,
  PenLineIcon,
  SettingsIcon,
  SignatureIcon,
  Trash2Icon,
  TypeIcon,
  UserIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { Label } from "@/components/ui/label"
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Toolbar, ToolbarGroup, ToolbarSeparator } from "@/components/ui/toolbar"
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"
import { FIELD_LABELS, RECIPIENT_COLORS } from "@/lib/constants"
import { cn } from "@/lib/utils"
import type { EditorRecipient } from "./context"
import { useFieldEditor } from "./context"
import type { AutosaveStatus } from "./use-autosave"

const FIELD_ICONS: Record<FieldType, React.ComponentType<{ "aria-hidden"?: boolean }>> = {
  SIGNATURE: SignatureIcon,
  INITIALS: PenLineIcon,
  DATE_SIGNED: CalendarIcon,
  NAME: UserIcon,
  EMAIL: AtSignIcon,
  TEXT: TypeIcon,
  CHECKBOX: CheckSquareIcon,
}

const SELECT_TOOL = "select"

const STATUS_TEXT: Record<AutosaveStatus, string> = {
  saved: "All changes saved",
  pending: "Unsaved changes",
  saving: "Saving…",
  error: "Couldn't save",
}

function RecipientDot({ colorIndex }: { colorIndex: number }) {
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

function RecipientSelect({
  recipients,
  value,
  onChange,
  className,
}: {
  recipients: EditorRecipient[]
  value: string | null
  onChange: (id: string) => void
  className?: string
}) {
  const items = recipients.map((r) => ({ value: r.id, label: r.name }))
  return (
    <Select items={items} value={value} onValueChange={(v) => v && onChange(String(v))}>
      <SelectTrigger className={className} aria-label="Recipient">
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

/** Properties of the selected field: owner, required, label, delete. */
function FieldProperties({ recipients }: { recipients: EditorRecipient[] }) {
  const { state, dispatch } = useFieldEditor()
  const field = state.fields.find((f) => f.key === state.selected)

  return (
    <Popover>
      <PopoverTrigger
        disabled={!field}
        render={<Button variant="ghost" size="sm" aria-label="Field settings" />}
      >
        <SettingsIcon aria-hidden />
        <span className="max-sm:hidden">Field</span>
      </PopoverTrigger>
      <PopoverPopup align="end" className="w-72">
        {field && (
          <div className="flex flex-col gap-4">
            <PopoverTitle>{FIELD_LABELS[field.type]}</PopoverTitle>
            <Field>
              <FieldLabel>Recipient</FieldLabel>
              <RecipientSelect
                className="w-full"
                recipients={recipients}
                value={field.recipientId}
                onChange={(recipientId) =>
                  dispatch({ type: "update", key: field.key, patch: { recipientId } })
                }
              />
            </Field>
            <Field>
              <FieldLabel>Label (optional)</FieldLabel>
              <Input
                value={field.label ?? ""}
                maxLength={120}
                placeholder={FIELD_LABELS[field.type]}
                onChange={(e) =>
                  dispatch({ type: "update", key: field.key, patch: { label: e.target.value } })
                }
              />
            </Field>
            <Label className="flex items-center gap-2">
              <Checkbox
                checked={field.required}
                onCheckedChange={(required) =>
                  dispatch({ type: "update", key: field.key, patch: { required } })
                }
              />
              Required
            </Label>
            <Button
              variant="destructive-outline"
              size="sm"
              onClick={() => dispatch({ type: "delete", key: field.key })}
            >
              <Trash2Icon aria-hidden />
              Delete field
            </Button>
          </div>
        )}
      </PopoverPopup>
    </Popover>
  )
}

export function FieldToolbar({
  recipients,
  tool,
  onToolChange,
  activeRecipientId,
  onRecipientChange,
  status,
  onRetry,
}: {
  recipients: EditorRecipient[]
  tool: FieldType | null
  onToolChange: (tool: FieldType | null) => void
  activeRecipientId: string | null
  onRecipientChange: (id: string) => void
  status: AutosaveStatus
  onRetry: () => void
}) {
  return (
    <Toolbar className="flex flex-wrap items-center gap-2 rounded-xl border bg-background p-1.5">
      <ToolbarGroup>
        <ToggleGroup
          value={[tool ?? SELECT_TOOL]}
          onValueChange={(v) => {
            const next = v[0]
            if (next === undefined) return // keep one tool pressed
            onToolChange(next === SELECT_TOOL ? null : (next as FieldType))
          }}
          aria-label="Field type"
        >
          <Tooltip>
            <TooltipTrigger
              render={<ToggleGroupItem value={SELECT_TOOL} aria-label="Select and move" />}
            >
              <MousePointer2Icon aria-hidden />
            </TooltipTrigger>
            <TooltipPopup>
              Select and move <Kbd>Esc</Kbd>
            </TooltipPopup>
          </Tooltip>
          {FIELD_TYPES.map((type) => {
            const Icon = FIELD_ICONS[type]
            return (
              <Tooltip key={type}>
                <TooltipTrigger
                  render={
                    <ToggleGroupItem
                      value={type}
                      aria-label={FIELD_LABELS[type]}
                      disabled={!activeRecipientId}
                    />
                  }
                >
                  <Icon aria-hidden />
                </TooltipTrigger>
                <TooltipPopup>{FIELD_LABELS[type]}: click or drag on a page</TooltipPopup>
              </Tooltip>
            )
          })}
        </ToggleGroup>
      </ToolbarGroup>
      <ToolbarSeparator />
      <ToolbarGroup>
        <RecipientSelect
          className="w-44"
          recipients={recipients}
          value={activeRecipientId}
          onChange={onRecipientChange}
        />
        <FieldProperties recipients={recipients} />
      </ToolbarGroup>
      <div className="ml-auto flex items-center gap-2 px-1 text-muted-foreground text-xs">
        <span className="max-lg:hidden">
          <Kbd>←↑→↓</Kbd> move · <Kbd>⇧</Kbd> faster · <Kbd>Del</Kbd> remove
        </span>
        <span
          aria-live="polite"
          className={cn(status === "error" && "text-destructive-foreground")}
        >
          {STATUS_TEXT[status]}
        </span>
        {status === "error" && (
          <Button variant="outline" size="xs" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </Toolbar>
  )
}
