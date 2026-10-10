"use client"

import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react"
import { useState } from "react"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover"
import { ApiError } from "@/lib/api"
import { blankState } from "@/lib/generator"
import { cn } from "@/lib/utils"
import { useGenerator } from "../generator-context"
import { useDocMode } from "./doc-mode"

/**
 * A blank in the text (docs/ai-documents.md → Editing): never bracketed text, always a distinct,
 * non-editable chip. Filled, it shows the value with a dotted underline; empty, a dashed chip with
 * the label ("skipped" when the question was skipped). In Editing a click fills it; in Preview a
 * click belongs to the section (ask about it). The value is data, not text.
 */
export function BlankView({ node, selected }: NodeViewProps) {
  const { detail, editable: canEdit, saveVariables } = useGenerator()
  const mode = useDocMode()
  const editable = canEdit && mode === "editing"
  const key = String(node.attrs.key)
  const variable = detail.version.data.variables.find((v) => v.key === key)
  const state = blankState(variable)
  const label = variable?.label ?? key
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const chip =
    state === "filled" ? (
      <span className="underline decoration-info decoration-dotted underline-offset-[3px]">
        {variable?.value}
      </span>
    ) : (
      <span className="mx-0.5 inline-flex items-baseline gap-1 whitespace-nowrap rounded-sm border border-warning border-dashed bg-warning/15 px-1.5 text-[0.86em] text-foreground">
        {label}
        {state === "skipped" && <span className="text-muted-foreground text-xs">skipped</span>}
      </span>
    )

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveVariables([{ key, value: value.trim() }], "edit")
      setOpen(false)
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "The document changed meanwhile. Reload and try again."
          : "Not saved. Try again.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <NodeViewWrapper
      as="span"
      className={cn("rounded-md", selected && "ring-2 ring-ring")}
      contentEditable={false}
    >
      {editable ? (
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (next) {
              setValue(variable?.value ?? "")
              setError(null)
            }
          }}
        >
          <PopoverTrigger asChild>
            <button type="button" aria-label={`${label}: ${variable?.value ?? "not filled"}`}>
              {chip}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (value.trim()) void save()
              }}
            >
              <Input
                label={label}
                description={variable?.hint}
                value={value}
                error={error ?? undefined}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
              <div className="flex justify-end">
                <Button type="submit" size="sm" loading={saving} disabled={!value.trim() || saving}>
                  Save
                </Button>
              </div>
            </form>
          </PopoverContent>
        </Popover>
      ) : (
        chip
      )}
    </NodeViewWrapper>
  )
}
