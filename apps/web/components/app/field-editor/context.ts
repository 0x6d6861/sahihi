"use client"

import type { FieldType } from "@sahihi/core"
import { createContext, useContext } from "react"
import type { EditorAction, EditorState } from "@/lib/field-editor"
import type { PageRotation } from "@/lib/field-geometry"

export interface EditorRecipient {
  id: string
  name: string
  colorIndex: number
}

export interface FieldEditorContextValue {
  state: EditorState
  dispatch: (action: EditorAction) => void
  /** Field type being placed, or null for the select tool. */
  tool: FieldType | null
  activeRecipientId: string | null
  recipients: Map<string, EditorRecipient>
  /** Intrinsic /Rotate of a page (1-based) of the active document, from Document.pages. */
  rotationOf: (page: number) => PageRotation
  /** The document on screen (ADR 0037): `id` is the envelope document, `documentId` the library's. */
  activeDocument: { id: string; documentId: string }
}

export const FieldEditorContext = createContext<FieldEditorContextValue | null>(null)

export function useFieldEditor(): FieldEditorContextValue {
  const ctx = useContext(FieldEditorContext)
  if (!ctx) throw new Error("useFieldEditor must be used inside <FieldEditor>")
  return ctx
}
