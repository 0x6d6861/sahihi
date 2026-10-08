"use client"

import {
  CreateFolderSchema,
  DocumentNameSchema,
  EnvelopeTitleSchema,
  TagListSchema,
  TemplateNameSchema,
} from "@sahihi/core"
import { useEffect, useId, useRef, useState } from "react"
import { DialogActions } from "@/components/app/confirm-dialog"
import { DIALOG_WITH_POPOVERS, RevealPopovers } from "@/components/app/dialog-popovers"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { Input } from "@/components/arc/input/input"
import { ApiError } from "@/lib/api"
import type { TagRef } from "@/lib/labels"
import { LabelColorField } from "./color-picker"
import { TagField } from "./tag-field"

/** What the dialog saves. `name` is present only when it changed (always, when creating). */
export interface EditItemChanges {
  name?: string
  color: string | null
  tags: string[]
}

export type EditItemKind = "folder" | "document" | "envelope" | "template"

const NAME_RULES = {
  folder: CreateFolderSchema.shape.name,
  document: DocumentNameSchema,
  envelope: EnvelopeTitleSchema,
  template: TemplateNameSchema,
}

const MAX_NAME: Record<EditItemKind, number> = {
  folder: 120,
  document: 200,
  envelope: 200,
  template: 120,
}

/**
 * Name, color and tags in one dialog (ADR 0025, 0038): "Edit" for a folder, document, envelope or
 * template, and
 * `mode="create"` for a new folder (empty name, "Create"). `onSubmit`
 * throws to keep the dialog open; a 409 (name taken, or a document already sent) shows on the
 * name, anything else under the tags.
 */
export function EditItemDialog({
  open,
  onOpenChange,
  kind,
  mode = "edit",
  name,
  renameLocked,
  color,
  tags,
  suggestions,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: EditItemKind
  mode?: "create" | "edit"
  name: string
  /** Why the name can't change (shown under the disabled field); omitted = editable. */
  renameLocked?: string
  color: string | null
  tags: TagRef[]
  /** Every tag in use in the workspace, for suggestions. */
  suggestions: TagRef[]
  onSubmit: (changes: EditItemChanges) => Promise<void>
}) {
  const ids = { color: useId() }
  const [nextName, setNextName] = useState(name)
  const [nextColor, setNextColor] = useState(color)
  const [nextTags, setNextTags] = useState<string[]>([])
  const [errors, setErrors] = useState<{ name?: string; tags?: string }>({})
  const [busy, setBusy] = useState(false)
  const colorField = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setNextName(name)
      setNextColor(color)
      setNextTags(tags.map((t) => t.name))
      setErrors({})
    }
  }, [open, name, color, tags])

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsedName = NAME_RULES[kind].safeParse(nextName)
    const parsedTags = TagListSchema.safeParse(nextTags)
    if (!parsedName.success || !parsedTags.success) {
      return setErrors({
        name: parsedName.error?.issues[0]?.message,
        tags: parsedTags.error?.issues[0]?.message,
      })
    }
    setBusy(true)
    try {
      await onSubmit({
        ...(parsedName.data !== name && { name: parsedName.data }),
        color: nextColor,
        tags: parsedTags.data,
      })
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Please try again."
      setErrors(
        err instanceof ApiError && err.status === 409 ? { name: message } : { tags: message },
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent
        title={`${mode === "create" ? "Create" : "Edit"} ${kind}`}
        className={DIALOG_WITH_POPOVERS}
        // Escape inside the open colour picker closes the picker, not the dialog.
        onEscapeKeyDown={(e) => {
          if (colorField.current?.contains(document.activeElement)) e.preventDefault()
        }}
      >
        <RevealPopovers>
          <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
            <Input
              label={kind === "envelope" ? "Title" : "Name"}
              name="name"
              value={nextName}
              maxLength={MAX_NAME[kind]}
              autoFocus={!renameLocked}
              disabled={Boolean(renameLocked) || busy}
              description={renameLocked}
              error={errors.name}
              onChange={(e) => {
                setNextName(e.target.value)
                setErrors((x) => ({ ...x, name: undefined }))
              }}
            />
            <div className="flex flex-col gap-2">
              <span id={ids.color} className="font-medium text-sm">
                Color
              </span>
              <LabelColorField ref={colorField} value={nextColor} onChange={setNextColor} />
            </div>
            <TagField
              value={nextTags}
              onChange={(t) => {
                setNextTags(t)
                setErrors((x) => ({ ...x, tags: undefined }))
              }}
              suggestions={suggestions.map((t) => t.name)}
              error={errors.tags}
            />
            <DialogActions>
              <Button
                variant="ghost"
                type="button"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                {mode === "create" ? "Create" : "Save"}
              </Button>
            </DialogActions>
          </form>
        </RevealPopovers>
      </DialogContent>
    </Dialog>
  )
}
