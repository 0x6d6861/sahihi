"use client"

import { useCallback, useEffect, useReducer, useRef } from "react"
import { useRegisterDraftEditor } from "@/components/app/envelope/draft-state"
import { toastManager } from "@/components/app/toast"
import { api } from "@/lib/api"
import {
  type EditorField,
  editorReducer,
  fieldsFromSaved,
  initialState,
  toFieldsPayload,
} from "@/lib/field-editor"
import type { EditorRecipient } from "./context"
import { type EditorDocument, FieldEditorSurface } from "./field-editor-surface"
import { useAutosave } from "./use-autosave"

type SavedField = Parameters<typeof fieldsFromSaved>[0][number]

/**
 * Field placement on a DRAFT envelope, autosaved with `PUT /envelopes/:id/fields`. One state for
 * every document of the envelope (the save replaces them all); the surface shows one at a time.
 */
export function FieldEditor({
  envelopeId,
  documents,
  recipients,
  initialFields,
  frameClassName,
  onFieldsChange,
}: {
  envelopeId: string
  /** The envelope's documents in signing order (ADR 0037). */
  documents: EditorDocument[]
  /** Recipients that may own fields (VIEWERs excluded), in list order. */
  recipients: EditorRecipient[]
  initialFields: SavedField[]
  frameClassName?: string
  /** Called with the fields after every change, e.g. for a live preview. */
  onFieldsChange?: (fields: EditorField[]) => void
}) {
  const [state, dispatch] = useReducer(editorReducer, initialFields, (f) =>
    initialState(fieldsFromSaved(f)),
  )
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
  useEffect(() => onFieldsChange?.(state.fields), [state.fields, onFieldsChange])

  return (
    <FieldEditorSurface
      state={state}
      dispatch={dispatch}
      recipients={recipients}
      documents={documents}
      detect
      status={status}
      onRetry={() => void retry()}
      frameClassName={frameClassName}
    />
  )
}
