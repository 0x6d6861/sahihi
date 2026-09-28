"use client"

import type { FieldType } from "@sahihi/core"
import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { useRegisterDraftEditor } from "@/components/app/envelope/draft-state"
import type { PDFEditorPageOverlayProps } from "@/components/extend/pdf-editor"
import { Skeleton } from "@/components/ui/skeleton"
import { toastManager } from "@/components/ui/toast"
import { api } from "@/lib/api"
import {
  type EditorField,
  editorReducer,
  fieldsFromSaved,
  initialState,
  toFieldsPayload,
} from "@/lib/field-editor"
import type { PageRotation } from "@/lib/field-geometry"
import { type EditorRecipient, FieldEditorContext } from "./context"
import { FieldLayer } from "./field-layer"
import { FieldToolbar } from "./field-toolbar"
import { useAutosave } from "./use-autosave"

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

// Stable reference: PDFEditor memoizes page rendering on renderPageOverlay.
const renderPageOverlay = (p: PDFEditorPageOverlayProps) => <FieldLayer pageNumber={p.pageNumber} />

type SavedField = Parameters<typeof fieldsFromSaved>[0][number]

export function FieldEditor({
  envelopeId,
  src,
  fileName,
  recipients,
  initialFields,
  pageRotations,
}: {
  envelopeId: string
  src: string
  fileName: string
  /** Recipients that may own fields (VIEWERs excluded), in list order. */
  recipients: EditorRecipient[]
  initialFields: SavedField[]
  /** Intrinsic /Rotate per page (index = page - 1), from Document.pages. */
  pageRotations: number[]
}) {
  const [state, dispatch] = useReducer(editorReducer, initialFields, (f) =>
    initialState(fieldsFromSaved(f)),
  )
  const [tool, setTool] = useState<FieldType | null>(null)
  const [activeRecipientId, setActiveRecipientId] = useState<string | null>(
    recipients[0]?.id ?? null,
  )

  // Recipients edited above (router.refresh): drop fields of removed/viewer recipients.
  const allowedKey = recipients.map((r) => r.id).join(",")
  useEffect(() => {
    const allowed = allowedKey ? allowedKey.split(",") : []
    dispatch({ type: "syncRecipients", allowed })
    setActiveRecipientId((cur) => (cur && allowed.includes(cur) ? cur : (allowed[0] ?? null)))
  }, [allowedKey])

  const fieldsRef = useRef<EditorField[]>(state.fields)
  fieldsRef.current = state.fields
  const save = useCallback(async () => {
    try {
      await api(`/envelopes/${envelopeId}/fields`, {
        method: "PUT",
        json: toFieldsPayload(fieldsRef.current),
      })
    } catch (err) {
      toastManager.add({
        title: "Couldn't save fields",
        description: err instanceof Error ? err.message : "Please try again.",
        type: "error",
      })
      throw err
    }
  }, [envelopeId])
  const { status, retry, flush } = useAutosave(state.revision, save)
  useRegisterDraftEditor("fields", { flush })

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
    () => ({ state, dispatch, tool, activeRecipientId, recipients: recipientMap, rotationOf }),
    [state, tool, activeRecipientId, recipientMap, rotationOf],
  )

  return (
    <FieldEditorContext.Provider value={ctx}>
      <div className="flex flex-col gap-3">
        <FieldToolbar
          recipients={recipients}
          tool={tool}
          onToolChange={setTool}
          activeRecipientId={activeRecipientId}
          onRecipientChange={setActiveRecipientId}
          status={status}
          onRetry={() => void retry()}
        />
        <div className="h-[75dvh] min-h-96 overflow-hidden rounded-xl border">
          <PDFEditor
            src={src}
            fileName={fileName}
            defaultMode="view"
            defaultZoom="fit-width"
            showUpload={false}
            showDownload={false}
            persistSignatures={false}
            features={VIEW_ONLY_FEATURES}
            renderPageOverlay={renderPageOverlay}
            onToast={(t) => toastManager.add({ title: t.message, type: t.tone })}
            className="size-full"
          />
        </div>
      </div>
    </FieldEditorContext.Provider>
  )
}
