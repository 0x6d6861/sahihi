"use client"

import { NodeViewContent, type NodeViewProps, NodeViewWrapper } from "@tiptap/react"
import { Button } from "@/components/arc/button/button"
import { cn } from "@/lib/utils"
import { useGenerator } from "../generator-context"

/**
 * A numbered clause. The number comes from a CSS counter, so it follows the order of sections as
 * they move; the title is an attribute edited in its own field; Discuss attaches the section to
 * the next chat message (beside the heading, never over the text).
 */
export function SectionView({ node, updateAttributes }: NodeViewProps) {
  const { editable, selectedSectionId, setSelectedSectionId } = useGenerator()
  const id = String(node.attrs.id)
  const selected = selectedSectionId === id
  return (
    <NodeViewWrapper
      as="section"
      aria-label={String(node.attrs.title)}
      className={cn(
        // Numbers come from the editor's CSS counter, so they follow the sections' order.
        node.attrs.numbered && "[counter-increment:section]",
        "-mx-3 flex flex-col gap-3 rounded-xl border-l-2 border-transparent px-3 py-1",
        selected && "border-info bg-muted/40",
      )}
    >
      <div className="flex items-baseline justify-between gap-3" contentEditable={false}>
        <h3 className="flex min-w-0 flex-1 items-baseline font-medium text-base">
          {node.attrs.numbered && (
            <span className="mr-1 before:content-[counter(section)'.']" aria-hidden />
          )}
          {editable ? (
            <input
              aria-label="Section title"
              className="min-w-0 flex-1 bg-transparent font-medium outline-none"
              value={String(node.attrs.title)}
              onChange={(e) => updateAttributes({ title: e.target.value })}
            />
          ) : (
            <span>{String(node.attrs.title)}</span>
          )}
        </h3>
        {editable && (
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={selected}
            onClick={() => setSelectedSectionId(selected ? null : id)}
          >
            {selected ? "Selected" : "Discuss"}
          </Button>
        )}
      </div>
      <NodeViewContent className="flex flex-col gap-3" />
    </NodeViewWrapper>
  )
}
