"use client"

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import { api } from "@/lib/api"
import type { GeneratorDetail } from "@/lib/generator"

/**
 * State shared by the generator's two panes (docs/ai-documents.md → Web): the latest version and
 * its finalise issues, the section attached to the next chat message, and whether a question card
 * is waiting for answers (the chat input stays closed meanwhile, so a reply can't be mistaken for
 * an answer).
 */
interface GeneratorState {
  detail: GeneratorDetail
  /** Re-reads the document (after the assistant changed it). */
  refresh: () => Promise<void>
  /** Saves blanks; resolves with the new version or throws ApiError (409 = stale). */
  saveVariables: (
    values: { key: string; value: string | null }[],
    source: "answer" | "edit",
  ) => Promise<void>
  saveRoles: (roles: { key: string; name: string | null; email: string | null }[]) => Promise<void>
  selectedSectionId: string | null
  setSelectedSectionId: (id: string | null) => void
  /** Read and clear the selection: it travels with exactly one message. */
  takeSelection: () => string | null
  pendingQuestion: string | null
  setPendingQuestion: (toolCallId: string | null) => void
  editable: boolean
}

const Ctx = createContext<GeneratorState | null>(null)

export function GeneratorProvider({
  initial,
  children,
}: {
  initial: GeneratorDetail
  children: React.ReactNode
}) {
  const [detail, setDetail] = useState(initial)
  const [selectedSectionId, setSelected] = useState<string | null>(null)
  const selection = useRef<string | null>(null)
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const id = initial.document.id
  const base = `/generated-documents/${encodeURIComponent(id)}`
  // The latest version id, read at call time so back-to-back saves chain correctly.
  const versionId = useRef(initial.version.id)
  versionId.current = detail.version.id

  const refresh = useCallback(async () => {
    const next = await api<GeneratorDetail>(base)
    versionId.current = next.version.id
    setDetail(next)
  }, [base])

  const applySaved = useCallback((saved: Pick<GeneratorDetail, "version" | "issues">) => {
    versionId.current = saved.version.id
    setDetail((d) => ({ ...d, version: saved.version, issues: saved.issues }))
  }, [])

  const saveVariables = useCallback<GeneratorState["saveVariables"]>(
    async (values, source) => {
      applySaved(
        await api<Pick<GeneratorDetail, "version" | "issues">>(`${base}/variables`, {
          method: "POST",
          json: { baseVersionId: versionId.current, source, values },
        }),
      )
    },
    [base, applySaved],
  )

  const saveRoles = useCallback<GeneratorState["saveRoles"]>(
    async (roles) => {
      applySaved(
        await api<Pick<GeneratorDetail, "version" | "issues">>(`${base}/roles`, {
          method: "PUT",
          json: { baseVersionId: versionId.current, roles },
        }),
      )
    },
    [base, applySaved],
  )

  const setSelectedSectionId = useCallback((sectionId: string | null) => {
    selection.current = sectionId
    setSelected(sectionId)
  }, [])

  const takeSelection = useCallback(() => {
    const current = selection.current
    selection.current = null
    setSelected(null)
    return current
  }, [])

  const editable = detail.document.status === "DRAFT" && detail.document.canEdit
  const value = useMemo(
    () => ({
      detail,
      refresh,
      saveVariables,
      saveRoles,
      selectedSectionId,
      setSelectedSectionId,
      takeSelection,
      pendingQuestion,
      setPendingQuestion,
      editable,
    }),
    [
      detail,
      refresh,
      saveVariables,
      saveRoles,
      selectedSectionId,
      setSelectedSectionId,
      takeSelection,
      pendingQuestion,
      editable,
    ],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useGenerator(): GeneratorState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useGenerator outside GeneratorProvider")
  return ctx
}
