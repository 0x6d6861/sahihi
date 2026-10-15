"use client"

import { NodeViewContent, type NodeViewProps, NodeViewWrapper } from "@tiptap/react"
import { MessageSquareIcon } from "@/components/app/icons"
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
      data-section-id={id}
      className={cn(
        // Numbers come from the editor's CSS counter, so they follow the sections' order.
        node.attrs.numbered && "[counter-increment:section]",
        "group relative -mx-2.5 flex flex-col gap-2 rounded-md border border-transparent px-2.5 py-2 transition-colors",
        // A section that just changed (document-editor.tsx `flash`): on at once, out slowly.
        "data-[flash=on]:bg-primary/10 data-[flash=off]:duration-700",
        askable && "cursor-pointer hover:bg-muted/60",
        // A pending suggestion, and the chat selection (Preview only; in Editing it would sit
        // behind the text): an emerald edge on a faint tint.
        (suggested || (selected && mode === "preview")) &&
          "border-primary bg-primary/5 hover:bg-primary/5",
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
      <div className="flex items-center gap-2" contentEditable={false}>
        <h3 className="flex min-w-0 items-baseline font-medium text-base leading-[1.6] tracking-tight">
          {node.attrs.numbered && (
            <span className="mr-1 before:content-[counter(section)'.']" aria-hidden />
          )}
          {editable && mode === "editing" ? (
            <input
              aria-label="Section title"
              className="min-w-0 flex-1 bg-transparent font-medium outline-none"
              value={title}
              onChange={(e) => updateAttributes({ title: e.target.value })}
            />
          ) : (
            <span>{title}</span>
          )}
        </h3>
        {suggested && (
          <span className="shrink-0 rounded-full bg-primary/12 px-2 py-px font-medium text-primary text-xs">
            Suggested edit
          </span>
        )}
        {askable && (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-px font-medium text-xs opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
              selected
                ? "bg-primary text-primary-foreground opacity-100"
                : "border bg-background text-muted-foreground",
            )}
          >
            <MessageSquareIcon className="size-3" />
            {selected ? "Asking about this" : "Ask about this"}
          </span>
        )}
      </div>
      <NodeViewContent className="flex flex-col gap-2" />
    </NodeViewWrapper>
  )
}
