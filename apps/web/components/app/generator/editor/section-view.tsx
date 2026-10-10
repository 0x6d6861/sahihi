"use client"

import { NodeViewContent, type NodeViewProps, NodeViewWrapper } from "@tiptap/react"
import { Badge } from "@/components/arc/badge/badge"
import { pendingSectionIds } from "@/lib/generator"
import { cn } from "@/lib/utils"
import { useGenerator } from "../generator-context"
import { useDocMode } from "./doc-mode"

/**
 * A numbered clause. The number comes from a CSS counter, so it follows the order of sections as
 * they move. In Preview the whole section is the target: hovering shows "Ask about this" in the
 * corner (never over the text), and a click attaches it to the next chat message (again to let
 * go). In Editing the title is its own field. A badge marks a section the assistant has suggested
 * an edit to, until it's accepted or rejected in the chat.
 */
export function SectionView({ node, updateAttributes }: NodeViewProps) {
  const { detail, editable, selectedSectionId, setSelectedSectionId } = useGenerator()
  const mode = useDocMode()
  const id = String(node.attrs.id)
  const title = String(node.attrs.title)
  const suggested = pendingSectionIds(detail.proposals).has(id)
  const selected = selectedSectionId === id
  // Only people who can change the document chat about it.
  const askable = mode === "preview" && editable
  const toggle = () => setSelectedSectionId(selected ? null : id)
  return (
    <NodeViewWrapper
      as="section"
      aria-label={title}
      className={cn(
        // Numbers come from the editor's CSS counter, so they follow the sections' order.
        node.attrs.numbered && "[counter-increment:section]",
        "group relative -mx-3.5 flex flex-col gap-3 rounded-xl px-3.5 pt-1.5 pb-1 transition-colors",
        askable && "cursor-pointer hover:bg-muted/60",
        selected && "bg-info/10 ring-1 ring-info",
      )}
      {...(askable
        ? {
            role: "button",
            tabIndex: 0,
            "aria-pressed": selected,
            onClick: toggle,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                toggle()
              }
            },
          }
        : {})}
    >
      <div className="flex items-baseline justify-between gap-3" contentEditable={false}>
        <h3 className="flex min-w-0 flex-1 items-baseline font-semibold text-lg">
          {node.attrs.numbered && (
            <span className="mr-1 before:content-[counter(section)'.']" aria-hidden />
          )}
          {editable && mode === "editing" ? (
            <input
              aria-label="Section title"
              className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
              value={title}
              onChange={(e) => updateAttributes({ title: e.target.value })}
            />
          ) : (
            <span>{title}</span>
          )}
        </h3>
        {suggested && (
          <span className="shrink-0">
            <Badge tone="info" size="sm">
              Suggested edit
            </Badge>
          </span>
        )}
        {askable && (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none shrink-0 rounded-full border bg-background px-2 py-1 font-medium text-[11px] text-muted-foreground leading-none opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
              selected && "opacity-100",
            )}
          >
            {selected ? "Selected" : "Ask about this"}
          </span>
        )}
      </div>
      <NodeViewContent className="flex flex-col gap-3" />
    </NodeViewWrapper>
  )
}
