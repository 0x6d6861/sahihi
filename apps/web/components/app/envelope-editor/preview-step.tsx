"use client"

import { createContext, useCallback, useContext, useMemo } from "react"
import { DocumentViewer } from "@/components/app/document-viewer"
import type { EditorRecipient } from "@/components/app/field-editor/context"
import { RecipientDot } from "@/components/app/field-editor/field-controls"
import type { PDFViewerPageOverlayProps } from "@/components/extend/pdf-viewer"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FIELD_LABELS, RECIPIENT_COLORS } from "@/lib/constants"
import { fieldSummary } from "@/lib/envelope-editor"
import type { EditorField } from "@/lib/field-editor"
import {
  displayedToLocalRect,
  type PageRotation,
  rectStyle,
  uprightContentStyle,
} from "@/lib/field-geometry"
import { cn } from "@/lib/utils"

interface PreviewState {
  fields: EditorField[]
  recipients: Map<string, EditorRecipient>
  rotationOf: (page: number) => PageRotation
}

const PreviewContext = createContext<PreviewState | null>(null)

/** Placed fields of one page, read-only, positioned like the field editor's layer. */
function PreviewLayer({ page }: { page: number }) {
  const ctx = useContext(PreviewContext)
  if (!ctx) return null
  const rot = ctx.rotationOf(page)
  return (
    <div className="on-paper pointer-events-none absolute inset-0">
      {ctx.fields
        .filter((f) => f.page === page)
        .map((f) => {
          const r = ctx.recipients.get(f.recipientId)
          return (
            <div
              key={f.key}
              title={`${FIELD_LABELS[f.type]}${r ? ` for ${r.name}` : ""}`}
              style={{ ...rectStyle(displayedToLocalRect(f, rot)), containerType: "size" }}
              className={cn(
                "absolute overflow-hidden rounded-sm border-2",
                RECIPIENT_COLORS[(r?.colorIndex ?? 0) % RECIPIENT_COLORS.length],
              )}
            >
              <span style={uprightContentStyle(rot)} className="flex items-center px-1">
                <span className="truncate font-medium text-[10px] leading-none">
                  {f.label || FIELD_LABELS[f.type]}
                  {f.required ? " *" : ""}
                </span>
              </span>
            </div>
          )
        })}
    </div>
  )
}

// Stable reference: the viewer memoizes page rendering on renderPageOverlay.
const renderPageOverlay = (p: PDFViewerPageOverlayProps) => <PreviewLayer page={p.pageNumber} />

/**
 * Step 3 of the draft editor: the original PDF with every placed field drawn over it, as the
 * recipients will find them, and a per-recipient count beside it. Fields are the live editor
 * state, so unsaved edits show too.
 */
export function PreviewStep({
  src,
  fileName,
  fields,
  recipients,
  pageRotations,
}: {
  src: string
  fileName: string
  fields: EditorField[]
  recipients: EditorRecipient[]
  pageRotations: number[]
}) {
  const recipientMap = useMemo(() => new Map(recipients.map((r) => [r.id, r])), [recipients])
  const rotationsKey = pageRotations.join(",")
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by value, not array identity
  const rotationOf = useCallback(
    (page: number): PageRotation => {
      const r = pageRotations[page - 1]
      return r === 90 || r === 180 || r === 270 ? r : 0
    },
    [rotationsKey],
  )
  const ctx = useMemo(
    () => ({ fields, recipients: recipientMap, rotationOf }),
    [fields, recipientMap, rotationOf],
  )

  return (
    <PreviewContext.Provider value={ctx}>
      <div className="flex size-full min-h-0 overflow-hidden">
        <div className="min-w-0 flex-1">
          <DocumentViewer
            src={src}
            fileName={fileName}
            renderPageOverlay={renderPageOverlay}
            className="h-full min-h-0 rounded-none border-0"
          />
        </div>
        <aside
          aria-label="Fields per recipient"
          className="w-72 shrink-0 border-l bg-background max-lg:hidden"
        >
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-4 p-4">
              <h2 className="font-medium text-sm">Fields per recipient</h2>
              <ul className="flex flex-col gap-3">
                {recipients.map((r) => {
                  const own = fields.filter((f) => f.recipientId === r.id)
                  return (
                    <li key={r.id} className="flex flex-col gap-1">
                      <span className="flex items-center gap-2 font-medium text-sm">
                        <RecipientDot colorIndex={r.colorIndex} />
                        <span className="truncate">{r.name}</span>
                        <span className="ml-auto text-muted-foreground tabular-nums">
                          {own.length}
                        </span>
                      </span>
                      {own.length === 0 ? (
                        <span className="text-muted-foreground text-xs">No fields yet</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          {fieldSummary(own.map((f) => f.type))}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          </ScrollArea>
        </aside>
      </div>
    </PreviewContext.Provider>
  )
}
