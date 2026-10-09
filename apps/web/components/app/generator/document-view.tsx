"use client"

import type { BlockNode, InlineNode, Section, Variable } from "@sahihi/core"
import { useState } from "react"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover"
import { ApiError } from "@/lib/api"
import { FIELD_LABELS } from "@/lib/constants"
import { blankIssues, blankState } from "@/lib/generator"
import { cn } from "@/lib/utils"
import { useGenerator } from "./generator-context"
import { sectionLabel } from "./section-label"

/**
 * The document as structured content (docs/ai-documents.md → Web). Blanks are chips, never
 * bracketed text: a value when filled, a dashed chip when not (with "skipped" when the question was
 * skipped). Clicking a chip fills it. Each section has a Discuss button beside its heading that
 * attaches it to the next chat message; nothing hovers over the text.
 *
 * Wording can't be edited here yet: the rich-text editor comes next (roadmap).
 */
export function DocumentView() {
  const { detail } = useGenerator()
  const { data } = detail.version
  const blanks = blankIssues(detail.issues)
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-8">
      {blanks.length > 0 && (
        <Alert
          tone="warning"
          title={blanks.length === 1 ? "1 blank to fill" : `${blanks.length} blanks to fill`}
        >
          Answer the assistant's questions, or click a highlighted blank to fill it.
        </Alert>
      )}
      <article className="flex flex-col gap-6 rounded-2xl border bg-card px-5 py-6 md:px-10 md:py-10">
        <h2 className="font-medium text-2xl tracking-tight">{data.title}</h2>
        {data.content.content.map((section) => (
          <SectionView key={section.attrs.id} section={section} />
        ))}
      </article>
    </div>
  )
}

function SectionView({ section }: { section: Section }) {
  const { detail, selectedSectionId, setSelectedSectionId, editable } = useGenerator()
  const selected = selectedSectionId === section.attrs.id
  return (
    <section
      aria-label={section.attrs.title}
      className={cn(
        "-mx-3 flex flex-col gap-3 rounded-xl border-l-2 border-transparent px-3 py-1",
        selected && "border-info bg-muted/40",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-medium text-base">
          {sectionLabel(detail.version.data.content, section)}
        </h3>
        {editable && (
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={selected}
            onClick={() => setSelectedSectionId(selected ? null : section.attrs.id)}
          >
            {selected ? "Selected" : "Discuss"}
          </Button>
        )}
      </div>
      {section.content.map((block, i) => (
        // Blocks have no ids of their own; their order within a version is stable.
        // biome-ignore lint/suspicious/noArrayIndexKey: see above
        <Block key={i} block={block} />
      ))}
    </section>
  )
}

function Block({ block }: { block: BlockNode }) {
  const { detail } = useGenerator()
  switch (block.type) {
    case "paragraph":
      return (
        <p className="text-sm leading-relaxed">
          <Inline nodes={block.content} />
        </p>
      )
    case "bulletList":
    case "orderedList":
      return (
        <ol className="flex flex-col gap-1.5 text-sm leading-relaxed">
          {block.content.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: items have no ids; order is stable
            <li key={i} className="flex gap-3">
              <span className="w-6 shrink-0 text-muted-foreground tabular-nums">
                {block.type === "orderedList" ? `(${String.fromCharCode(97 + (i % 26))})` : "•"}
              </span>
              <span>
                <Inline nodes={item.content[0].content} />
              </span>
            </li>
          ))}
        </ol>
      )
    case "signatureBlock": {
      const role = detail.version.data.roles.find((r) => r.key === block.attrs.roleKey)
      return (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed p-4">
          {block.content.map((c, i) =>
            c.type === "paragraph" ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: captions have no ids
              <p key={i} className="text-sm">
                <Inline nodes={c.content} />
              </p>
            ) : (
              <div key={c.attrs.id} className="flex flex-col gap-1">
                <div className="h-8 border-b" />
                <span className="text-muted-foreground text-xs">
                  {c.attrs.label ?? FIELD_LABELS[c.attrs.fieldType]} ·{" "}
                  {role?.label ?? block.attrs.roleKey}
                  {role?.name ? ` (${role.name})` : ""}
                </span>
              </div>
            ),
          )}
        </div>
      )
    }
  }
}

function Inline({ nodes }: { nodes: InlineNode[] }) {
  const { detail } = useGenerator()
  return nodes.map((n, i) => {
    const bold = n.marks?.some((m) => m.type === "bold")
    const underline = n.marks?.some((m) => m.type === "underline")
    const style = cn(bold && "font-medium", underline && "underline underline-offset-4")
    if (n.type === "text") {
      return (
        // biome-ignore lint/suspicious/noArrayIndexKey: inline runs have no ids
        <span key={i} className={style}>
          {n.text}
        </span>
      )
    }
    const variable = detail.version.data.variables.find((v) => v.key === n.attrs.key)
    // biome-ignore lint/suspicious/noArrayIndexKey: a blank can appear twice in one paragraph
    return <Blank key={i} variableKey={n.attrs.key} variable={variable} className={style} />
  })
}

function Blank({
  variableKey,
  variable,
  className,
}: {
  variableKey: string
  variable: Variable | undefined
  className?: string
}) {
  const { editable, saveVariables } = useGenerator()
  const state = blankState(variable)
  const label = variable?.label ?? variableKey
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const chip =
    state === "filled" ? (
      <span
        className={cn("decoration-dotted underline-offset-4", editable && "underline", className)}
      >
        {variable?.value}
      </span>
    ) : (
      <span
        className={cn(
          "mx-0.5 inline-flex items-baseline gap-1 rounded-md border border-warning border-dashed bg-warning/15 px-1.5 text-foreground",
          className,
        )}
      >
        {label}
        {state === "skipped" && <span className="text-muted-foreground text-xs">skipped</span>}
      </span>
    )
  if (!editable) return chip

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveVariables([{ key: variableKey, value: value.trim() }], "edit")
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
  )
}
