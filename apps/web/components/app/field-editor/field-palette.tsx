"use client"

import { FIELD_TYPES, type FieldType } from "@sahihi/core"
import { MousePointer2Icon } from "@/components/app/icons"
import { Kbd } from "@/components/ui/kbd"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Toggle } from "@/components/ui/toggle"
import { FIELD_LABELS } from "@/lib/constants"
import type { EditorRecipient } from "./context"
import { useFieldEditor } from "./context"
import { DetectFields } from "./detect-fields"
import { FIELD_ICONS, FieldSettingsForm, RecipientSelect } from "./field-controls"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 p-4">
      <h2 className="font-medium text-sm">{title}</h2>
      {children}
    </section>
  )
}

/**
 * The field tools as a side panel (draft envelope editor, ADR 0021): who the next field is for,
 * one button per field type, "Detect fields", then the selected field's settings.
 */
export function FieldPalette({
  recipients,
  tool,
  onToolChange,
  activeRecipientId,
  onRecipientChange,
  detect = false,
}: {
  recipients: EditorRecipient[]
  tool: FieldType | null
  onToolChange: (tool: FieldType | null) => void
  activeRecipientId: string | null
  onRecipientChange: (id: string) => void
  /** Offers "Detect fields" (form fields and anchor tags, ADR 0020) on the active document. */
  detect?: boolean
}) {
  const { state } = useFieldEditor()
  const field = state.fields.find((f) => f.key === state.selected)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <Section title="Recipient">
          <RecipientSelect
            className="w-full"
            size="default"
            recipients={recipients}
            value={activeRecipientId}
            onChange={onRecipientChange}
          />
        </Section>
        <Separator />
        <Section title="Add fields">
          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="sr-only">Field type</legend>
            <Toggle
              variant="outline"
              className="press justify-start"
              pressed={tool === null}
              onPressedChange={(pressed) => pressed && onToolChange(null)}
            >
              <MousePointer2Icon aria-hidden />
              Select
            </Toggle>
            {FIELD_TYPES.map((type) => {
              const Icon = FIELD_ICONS[type]
              return (
                <Toggle
                  key={type}
                  variant="outline"
                  className="press justify-start"
                  pressed={tool === type}
                  disabled={!activeRecipientId}
                  onPressedChange={(pressed) => onToolChange(pressed ? type : null)}
                >
                  <Icon aria-hidden />
                  {FIELD_LABELS[type]}
                </Toggle>
              )
            })}
          </fieldset>
          <p className="text-muted-foreground text-xs">
            Pick a type, then click or drag on a page. Choose Select to move or resize fields.
          </p>
          {detect && <DetectFields />}
        </Section>
        <Separator />
        <Section title={field ? `${FIELD_LABELS[field.type]} settings` : "Field settings"}>
          {field ? (
            <FieldSettingsForm field={field} recipients={recipients} />
          ) : (
            <p className="text-muted-foreground text-sm">
              Select a field on the page to change who it's for, its label or whether it's required.
            </p>
          )}
        </Section>
      </ScrollArea>
      <p className="border-t px-4 py-3 text-muted-foreground text-xs">
        <Kbd>←↑→↓</Kbd> move · <Kbd>⇧</Kbd> faster · <Kbd>Del</Kbd> remove
      </p>
    </div>
  )
}
