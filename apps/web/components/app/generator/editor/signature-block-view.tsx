"use client"

import type { SignatureBlock } from "@sahihi/core"
import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react"
import { FIELD_LABELS } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { useGenerator } from "../generator-context"

/**
 * Where one signer signs. One block in the editor: it can be moved or deleted, not edited inside
 * (signers and fields are set elsewhere). The person's name comes from the Signers tab.
 */
export function SignatureBlockView({ node, selected }: NodeViewProps) {
  const { detail } = useGenerator()
  const roleKey = String(node.attrs.roleKey)
  const role = detail.version.data.roles.find((r) => r.key === roleKey)
  const items = (node.attrs.items ?? []) as SignatureBlock["content"]
  const variables = detail.version.data.variables
  return (
    <NodeViewWrapper
      contentEditable={false}
      data-drag-handle
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-dashed p-4",
        selected && "ring-2 ring-ring",
      )}
    >
      {items.map((c, i) =>
        c.type === "paragraph" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: captions have no ids
          <p key={i} className="text-sm">
            {c.content.map((n) => {
              if (n.type === "text") return n.text
              const v = variables.find((x) => x.key === n.attrs.key)
              return v?.value != null ? (
                v.value
              ) : (
                // The same chip as an empty blank in the text.
                <span
                  key={n.attrs.key}
                  className="mx-0.5 inline-flex items-baseline whitespace-nowrap rounded-sm border border-warning border-dashed bg-warning/15 px-1.5 text-[0.86em] text-foreground"
                >
                  {v?.label ?? n.attrs.key}
                </span>
              )
            })}
          </p>
        ) : (
          <div key={c.attrs.id} className="flex flex-col gap-1">
            <div className="h-8 border-b" />
            <span className="text-muted-foreground text-xs">
              {c.attrs.label ?? FIELD_LABELS[c.attrs.fieldType]} · {role?.label ?? roleKey}
              {role?.name ? ` (${role.name})` : ""}
            </span>
          </div>
        ),
      )}
    </NodeViewWrapper>
  )
}
