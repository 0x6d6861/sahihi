"use client"

import dynamic from "next/dynamic"
import { createContext, useCallback, useContext, useMemo, useState } from "react"
import { DocumentSwitcher } from "@/components/app/envelope/document-switcher"
import type { EditorRecipient } from "@/components/app/field-editor/context"
import { RecipientDot } from "@/components/app/field-editor/field-controls"
import {
  EDITOR_ZOOM,
  type EditorDocument,
  PdfFrame,
  VIEW_ONLY_FEATURES,
} from "@/components/app/field-editor/field-editor-surface"
import { CircleAlertIcon, CircleCheckIcon, EyeIcon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import type { PDFEditorPageOverlayProps } from "@/components/extend/pdf-editor"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { FIELD_LABEL_CLASS, FIELD_LABELS, RECIPIENT_COLORS } from "@/lib/constants"
import { fieldSummary, invitationOrderLine } from "@/lib/envelope-editor"
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
              <span
                style={uprightContentStyle(rot)}
                className="flex items-center justify-center px-1"
              >
                <span className={FIELD_LABEL_CLASS}>
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
 * second toolbar row, like on the fields step), and beside it each recipient's fields across all
 * documents (with their step when they sign in order) and two checks: everyone has a signature
 * field, and who is invited when. Fields are the live editor state, so unsaved edits show too.
 */
export function PreviewStep({
  documents,
  fields: allFields,
  recipients,
  stepOf,
}: {
  /** The envelope's documents in signing order; one is on screen at a time (ADR 0037). */
  documents: EditorDocument[]
  fields: EditorField[]
  recipients: EditorRecipient[]
  /** Each recipient's signing step, when they sign in order; null when everyone signs at once. */
  stepOf: Record<string, number> | null
}) {
  const [activeId, setActiveId] = useState(documents[0]?.id ?? "")
  // A document whose PDF failed to load (the viewer shows why).
  const [failedId, setFailedId] = useState<string | null>(null)
  const active = documents.find((d) => d.id === activeId) ?? documents[0]
  const pageRotations = active?.pageRotations ?? []
  const fields = useMemo(
    () => allFields.filter((f) => f.envelopeDocumentId === active?.id),
    [allFields, active?.id],
  )
  const missingSignature = recipients.filter(
    (r) => !allFields.some((f) => f.recipientId === r.id && f.type === "SIGNATURE"),
  )
  const order = stepOf
    ? invitationOrderLine(recipients.map((r) => ({ name: r.name, step: stepOf[r.id] ?? 1 })))
    : null
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
        <PdfFrame docKey={active?.id ?? ""} failed={!active?.src || failedId === active?.id}>
          {active?.src ? (
            <PDFEditor
              // One viewer per document: switching loads the other PDF fresh.
              key={active.id}
              src={active.src}
              fileName={active.name}
              defaultMode="view"
              defaultZoom={EDITOR_ZOOM}
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
                </div>
              }
              onDocumentLoadError={() => setFailedId(active.id)}
              onToast={(t) => toastManager.add({ title: t.message, type: t.tone })}
              className="size-full"
            />
          ) : (
            <p className="p-6 text-muted-foreground text-sm">The document could not be loaded.</p>
          )}
        </PdfFrame>
        <aside
          aria-label="Fields per recipient"
          className="w-80 shrink-0 border-l bg-background max-lg:hidden"
        >
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-5 p-5">
              <p className="flex items-start gap-2.5 rounded-2xl bg-muted px-3.5 py-3 text-muted-foreground text-xs leading-[1.45]">
                <EyeIcon aria-hidden className="mt-px size-3.5 shrink-0" />
                Fields as recipients will see them. Go back to Fields to change them.
              </p>
              <div className="flex flex-col gap-3">
                <h2 className="font-medium text-sm">Fields per recipient</h2>
                <ul className="flex flex-col gap-2">
                  {recipients.map((r) => {
                    // Across every document: what the recipient will be asked to do.
                    const own = allFields.filter((f) => f.recipientId === r.id)
                    const step = stepOf?.[r.id]
                    return (
                      <li
                        key={r.id}
                        className="flex flex-col gap-1 rounded-2xl border bg-card px-3 py-2.5"
                      >
                        <span className="flex items-center gap-2 text-sm">
                          <RecipientDot colorIndex={r.colorIndex} />
                          <span className="truncate font-medium">{r.name}</span>
                          {step !== undefined && (
                            <span className="ml-auto shrink-0 text-muted-foreground text-xs">
                              Step {step}
                            </span>
                          )}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {own.length === 0
                            ? "No fields yet"
                            : fieldSummary(own.map((f) => f.type))}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
              <ul className="flex flex-col gap-2 border-t pt-4 text-sm">
                <Check ok={missingSignature.length === 0}>
                  {missingSignature.length === 0
                    ? "Every recipient has a signature field"
                    : `No signature field yet for ${missingSignature.map((r) => r.name).join(", ")}`}
                </Check>
                {order && <Check ok>{order}</Check>}
              </ul>
            </div>
          </ScrollArea>
        </aside>
      </div>
    </PreviewContext.Provider>
  )
}

/** One line of the checks under the recipients: green when it holds, amber when not. */
function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const Icon = ok ? CircleCheckIcon : CircleAlertIcon
  return (
    <li className="flex items-start gap-2">
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 size-3.5 shrink-0",
          ok ? "text-success-foreground" : "text-warning-foreground",
        )}
      />
      {children}
    </li>
  )
}
