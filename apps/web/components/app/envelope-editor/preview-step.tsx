"use client"

import dynamic from "next/dynamic"
import { createContext, useCallback, useContext, useMemo, useState } from "react"
import { DocumentSwitcher } from "@/components/app/envelope/document-switcher"
import type { EditorRecipient } from "@/components/app/field-editor/context"
import { RecipientDot } from "@/components/app/field-editor/field-controls"
import {
  type EditorDocument,
  VIEW_ONLY_FEATURES,
} from "@/components/app/field-editor/field-editor-surface"
import { toastManager } from "@/components/app/toast"
import type { PDFEditorPageOverlayProps } from "@/components/extend/pdf-editor"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
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

// Same view-only PDFEditor as the field editor, so the document switcher sits in its second
// toolbar row on both steps (ribbonContent, ADR 0019).
const PDFEditor = dynamic(() => import("@/components/extend/pdf-editor").then((m) => m.PDFEditor), {
  ssr: false,
  loading: () => <Skeleton className="size-full" />,
})

interface PreviewState {
  /** Fields of the document on screen. */
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

// Stable reference: the editor memoizes page rendering on renderPageOverlay.
const renderPageOverlay = (p: PDFEditorPageOverlayProps) => <PreviewLayer page={p.pageNumber} />

/**
 * Step 4 of the draft editor: each original PDF with its placed fields drawn over it, as the
 * recipients will find them (one document at a time, ADR 0037; the switcher sits in the viewer's
 * second toolbar row, like on the fields step), and a per-recipient count
 * across all documents beside it. Fields are the live editor
 * state, so unsaved edits show too.
 */
export function PreviewStep({
  documents,
  fields: allFields,
  recipients,
}: {
  /** The envelope's documents in signing order; one is on screen at a time (ADR 0037). */
  documents: EditorDocument[]
  fields: EditorField[]
  recipients: EditorRecipient[]
}) {
  const [activeId, setActiveId] = useState(documents[0]?.id ?? "")
  const active = documents.find((d) => d.id === activeId) ?? documents[0]
  const pageRotations = active?.pageRotations ?? []
  const fields = useMemo(
    () => allFields.filter((f) => f.envelopeDocumentId === active?.id),
    [allFields, active?.id],
  )
  const recipientMap = useMemo(() => new Map(recipients.map((r) => [r.id, r])), [recipients])
  const fieldCount = (id: string) => allFields.filter((f) => f.envelopeDocumentId === id).length
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
          {active?.src ? (
            <PDFEditor
              // One viewer per document: switching loads the other PDF fresh.
              key={active.id}
              src={active.src}
              fileName={active.name}
              defaultMode="view"
              defaultZoom="fit-width"
              showUpload={false}
              persistSignatures={false}
              features={VIEW_ONLY_FEATURES}
              renderPageOverlay={renderPageOverlay}
              ribbonContent={
                <div className="flex min-w-0 flex-1 items-center gap-2 text-muted-foreground text-xs">
                  <DocumentSwitcher
                    documents={documents}
                    value={active.id}
                    onValueChange={setActiveId}
                    accessory={(id) => (
                      <span className="text-muted-foreground tabular-nums">
                        {fieldCount(id) || ""}
                      </span>
                    )}
                  />
                  <span className="max-lg:hidden">
                    Fields as recipients will see them. Go back to Fields to change them.
                  </span>
                </div>
              }
              onToast={(t) => toastManager.add({ title: t.message, type: t.tone })}
              className="size-full"
            />
          ) : (
            <p className="p-6 text-muted-foreground text-sm">The document could not be loaded.</p>
          )}
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
                  // Across every document: what the recipient will be asked to do.
                  const own = allFields.filter((f) => f.recipientId === r.id)
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
