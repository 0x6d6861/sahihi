"use client"

import type { DocContent, SignersDefinition, VariableType } from "@sahihi/core"
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
  /** Saves who signs and where (roles, contacts, fields). */
  saveSigners: (signers: SignersDefinition) => Promise<void>
  /** Saves edited text on top of `baseVersionId`; resolves with the new version's id. */
  saveContent: (input: {
    baseVersionId: string
    content: DocContent
    newVariables: { key: string; label: string; type: VariableType }[]
  }) => Promise<string>
  /** Accept or reject an assistant proposal; then the page reloads the document. */
  decideProposal: (proposalId: string, action: "accept" | "reject") => Promise<void>
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

  const saveSigners = useCallback<GeneratorState["saveSigners"]>(
    async (signers) => {
      applySaved(
        await api<Pick<GeneratorDetail, "version" | "issues">>(`${base}/signers`, {
          method: "PUT",
          json: { baseVersionId: versionId.current, signers },
        }),
      )
    },
    [base, applySaved],
  )

  const saveContent = useCallback<GeneratorState["saveContent"]>(
    async (input) => {
      const saved = await api<Pick<GeneratorDetail, "version" | "issues">>(`${base}/content`, {
        method: "PUT",
        json: input,
      })
      applySaved(saved)
      return saved.version.id
    },
    [base, applySaved],
  )

  const decideProposal = useCallback<GeneratorState["decideProposal"]>(
    async (proposalId, action) => {
      try {
        await api(`${base}/proposals/${encodeURIComponent(proposalId)}/${action}`, {
          method: "POST",
        })
      } finally {
        // Accepted: a new version; out of date: the new status. Either way, show the server's state.
        await refresh()
      }
    },
    [base, refresh],
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
      saveSigners,
      saveContent,
      decideProposal,
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
      saveSigners,
      saveContent,
      decideProposal,
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
