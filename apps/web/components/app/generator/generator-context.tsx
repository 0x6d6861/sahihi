"use client"

import type { DocContent, SignersDefinition, VariableType } from "@sahihi/core"
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import { api } from "@/lib/api"
import type { GeneratorDetail, IssueTarget } from "@/lib/generator"

export type DocumentTab = "preview" | "editing" | "signers" | "pdf"
export type Pane = "chat" | "document"
/** A place in the document pane to bring into view: a blank (opened to fill), a section, a signer. */
export type NavTarget = IssueTarget | { kind: "section"; id: string; flash?: boolean }

/**
 * State shared by the generator's two panes (docs/ai-documents.md → Web): the latest version and
 * its finalise issues, the section attached to the next chat message, whether a question card
 * is waiting for answers (the chat input stays closed meanwhile, so a reply can't be mistaken for
 * an answer), which tab and pane show, and jumps to a blank, section or signer. Panes that save on
 * their own register a flush, so Finalise sees every edit.
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
  /** Saves who signs and where (roles, contacts, fields); resolves with the new version. */
  saveSigners: (signers: SignersDefinition) => Promise<GeneratorDetail["version"]>
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
  pendingQuestion: string | null
  setPendingQuestion: (toolCallId: string | null) => void
  editable: boolean
  tab: DocumentTab
  setTab: (tab: DocumentTab) => void
  /** Phones show one pane at a time. */
  pane: Pane
  setPane: (pane: Pane) => void
  /** The latest jump; `n` changes on every call, so jumping to the same place twice works. */
  nav: { target: NavTarget; n: number } | null
  /** Shows the target's tab and pane; the editor or Signers tab then scrolls to it. */
  navigate: (target: NavTarget) => void
  /** Registers a pending-save flush (autosaving panes); returns the unregister. */
  registerFlush: (flush: () => Promise<boolean>) => () => void
  /** Saves everything pending now. Resolves true when it all saved. */
  flushAll: () => Promise<boolean>
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
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const [tab, setTab] = useState<DocumentTab>("preview")
  const [pane, setPane] = useState<Pane>("chat")
  const [nav, setNav] = useState<GeneratorState["nav"]>(null)
  const flushes = useRef(new Set<() => Promise<boolean>>())
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
      const saved = await api<Pick<GeneratorDetail, "version" | "issues">>(`${base}/signers`, {
        method: "PUT",
        json: { baseVersionId: versionId.current, signers },
      })
      applySaved(saved)
      return saved.version
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

  const navigate = useCallback((target: NavTarget) => {
    setPane("document")
    if (target.kind === "signers") setTab("signers")
    // Blanks and sections live in the editor; keep Editing if that's where the person is.
    else setTab((t) => (t === "editing" ? t : "preview"))
    setNav((prev) => ({ target, n: (prev?.n ?? 0) + 1 }))
  }, [])

  const registerFlush = useCallback((flush: () => Promise<boolean>) => {
    flushes.current.add(flush)
    return () => {
      flushes.current.delete(flush)
    }
  }, [])

  const flushAll = useCallback(async () => {
    const results = await Promise.all([...flushes.current].map((flush) => flush()))
    return results.every(Boolean)
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
      pendingQuestion,
      setPendingQuestion,
      editable,
      tab,
      setTab,
      pane,
      setPane,
      nav,
      navigate,
      registerFlush,
      flushAll,
    }),
    [
      detail,
      refresh,
      saveVariables,
      saveSigners,
      saveContent,
      decideProposal,
      selectedSectionId,
      pendingQuestion,
      editable,
      tab,
      pane,
      nav,
      navigate,
      registerFlush,
      flushAll,
    ],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useGenerator(): GeneratorState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useGenerator outside GeneratorProvider")
  return ctx
}
