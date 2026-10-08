"use client"

import type { FieldType } from "@sahihi/core"
import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useState } from "react"
import { DocumentSwitcher } from "@/components/app/envelope/document-switcher"
import { SettingsIcon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { Button } from "@/components/arc/button/button"
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/arc/drawer/drawer"
import type { PDFEditorPageOverlayProps } from "@/components/extend/pdf-editor"
// coss Skeleton: a block the size of the PDF viewer (Arc's skeleton draws text lines).
import { Skeleton } from "@/components/ui/skeleton"
import type { EditorAction, EditorState } from "@/lib/field-editor"
import type { PageRotation } from "@/lib/field-geometry"
import { cn } from "@/lib/utils"
import { type EditorRecipient, FieldEditorContext } from "./context"
import { SaveStatus } from "./field-controls"
import { FieldLayer } from "./field-layer"
import { FieldPalette } from "./field-palette"
import type { AutosaveStatus } from "./use-autosave"

// ~20 EmbedPDF plugins: load only on this route, client-side (docs/ui.md → Extend specifics).
const PDFEditor = dynamic(() => import("@/components/extend/pdf-editor").then((m) => m.PDFEditor), {
  ssr: false,
  loading: () => <Skeleton className="size-full" />,
})

// Field-placement shell: view-only, every editing feature off (docs/ui.md → PDFEditor configurations).
const VIEW_ONLY_FEATURES = {
  annotate: false,
  redact: false,
  forms: false,
  sign: false,
  stamps: false,
  pages: false,
  security: false,
  capture: false,
  attachments: false,
  comments: false,
}

/** One of the envelope's documents in the field editor (ADR 0037). */
export interface EditorDocument {
  /** Envelope document id (what fields point at). */
  id: string
  /** Library document id (field detection reads it). */
  documentId: string
  name: string
  /** Presigned URL of the original; null when it couldn't be loaded. */
  src: string | null
  /** Intrinsic /Rotate per page (index = page - 1), from Document.pages. */
  pageRotations: number[]
}

// Stable reference: PDFEditor memoizes page rendering on renderPageOverlay.
const renderPageOverlay = (p: PDFEditorPageOverlayProps) => <FieldLayer pageNumber={p.pageNumber} />

/**
 * The field-placement UI without persistence: PDF editor with the field layer, and the field tools
 * (`FieldPalette`) in a panel beside it, or in a "Fields" sheet below `lg` (ADR 0021). The editor's
 * second toolbar row (`ribbonContent`, ADR 0019) carries a hint and the save status. `FieldEditor`
 * owns the fields state and autosaves it. When the recipients change (removed, or made a viewer),
 * their fields are dropped and the active recipient moves to one that can still own fields.
 */
export function FieldEditorSurface({
  state,
  dispatch,
  recipients,
  documents,
  detect = false,
  status,
  onRetry,
  frameClassName,
}: {
  state: EditorState
  dispatch: (action: EditorAction) => void
  /** Recipients that may own fields (VIEWERs excluded), in list order. */
  recipients: EditorRecipient[]
  /** The envelope's documents in signing order; one is on screen at a time (ADR 0037). */
  documents: EditorDocument[]
  /** Offers "Detect fields" (form fields and anchor tags, ADR 0020) on the active document. */
  detect?: boolean
  status?: AutosaveStatus
  onRetry?: () => void
  frameClassName?: string
}) {
  const [activeId, setActiveId] = useState(documents[0]?.id ?? "")
  // A document removed elsewhere: fall back to the first.
  const active = documents.find((d) => d.id === activeId) ?? documents[0]
  const pageRotations = active?.pageRotations ?? []
  function switchDocument(id: string) {
    setActiveId(id)
    dispatch({ type: "select", key: null })
  }
  const [tool, setTool] = useState<FieldType | null>(null)
  const [activeRecipientId, setActiveRecipientId] = useState<string | null>(
    recipients[0]?.id ?? null,
  )

  // Recipients edited elsewhere: drop fields of removed/viewer recipients.
  const allowedKey = recipients.map((r) => r.id).join(",")
  useEffect(() => {
    const allowed = allowedKey ? allowedKey.split(",") : []
    dispatch({ type: "syncRecipients", allowed })
    setActiveRecipientId((cur) => (cur && allowed.includes(cur) ? cur : (allowed[0] ?? null)))
  }, [allowedKey, dispatch])

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
  const activeDocument = useMemo(
    () => ({ id: active?.id ?? "", documentId: active?.documentId ?? "" }),
    [active?.id, active?.documentId],
  )
  const ctx = useMemo(
    () => ({
      state,
      dispatch,
      tool,
      activeRecipientId,
      recipients: recipientMap,
      rotationOf,
      activeDocument,
    }),
    [state, dispatch, tool, activeRecipientId, recipientMap, rotationOf, activeDocument],
  )
  const fieldCount = (id: string) => state.fields.filter((f) => f.envelopeDocumentId === id).length

  const toolProps = {
    recipients,
    tool,
    onToolChange: setTool,
    activeRecipientId,
    onRecipientChange: setActiveRecipientId,
  }

  const ribbon = (
    <div className="flex min-w-0 flex-1 items-center gap-2 text-muted-foreground text-xs">
      <Drawer>
        {/* Wrapped: Arc's unlayered CSS module would beat a `lg:hidden` utility on the button. */}
        <span className="lg:hidden">
          <DrawerTrigger asChild>
            <Button variant="secondary" size="sm">
              <SettingsIcon aria-hidden />
              Fields
            </Button>
          </DrawerTrigger>
        </span>
        <DrawerContent side="right" title="Fields">
          <FieldPalette {...toolProps} detect={detect} />
        </DrawerContent>
      </Drawer>
      <DocumentSwitcher
        documents={documents}
        value={active?.id ?? ""}
        onValueChange={switchDocument}
        accessory={(id) => (
          <span className="text-muted-foreground tabular-nums">{fieldCount(id) || ""}</span>
        )}
      />
      <span className="max-lg:hidden">
        Pick a field type on the right, then click or drag on a page.
      </span>
      <span className="ml-auto flex items-center gap-2">
        <SaveStatus status={status} onRetry={onRetry} />
      </span>
    </div>
  )

  const editor = active?.src ? (
    <PDFEditor
      // One viewer per document: switching loads the other PDF fresh.
      key={active.id}
      src={active.src}
      fileName={active.name}
      defaultMode="view"
      defaultZoom="fit-width"
      showUpload={false}
      showDownload={false}
      persistSignatures={false}
      features={VIEW_ONLY_FEATURES}
      renderPageOverlay={renderPageOverlay}
      ribbonContent={ribbon}
      onToast={(t) => toastManager.add({ title: t.message, type: t.tone })}
      className="size-full"
    />
  ) : (
    <p className="p-6 text-muted-foreground text-sm">The document could not be loaded.</p>
  )

  return (
    <FieldEditorContext.Provider value={ctx}>
      <div className={cn("flex size-full min-h-0 overflow-hidden", frameClassName)}>
        <div className="min-w-0 flex-1">{editor}</div>
        <aside
          aria-label="Field tools"
          className="w-72 shrink-0 border-l bg-background max-lg:hidden"
        >
          <FieldPalette {...toolProps} detect={detect} />
        </aside>
      </div>
    </FieldEditorContext.Provider>
  )
}
