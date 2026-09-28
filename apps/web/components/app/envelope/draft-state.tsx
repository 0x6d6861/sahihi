"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react"

/**
 * Lets the Send button wait for the draft editors on the page: the field editor flushes its
 * debounced autosave, and the recipients editor reports unsaved edits (they are saved explicitly).
 */
interface DraftEditor {
  /** Save now; resolve true when everything is on the server. */
  flush?: () => Promise<boolean>
  /** Unsaved changes that `flush` can't save on its own. */
  unsavedMessage?: () => string | null
}

interface DraftState {
  register: (key: string, editor: DraftEditor) => () => void
  /** Flush everything. Returns problems that block sending (empty when ready). */
  settle: () => Promise<string[]>
}

const DraftStateContext = createContext<DraftState | null>(null)

export function DraftStateProvider({ children }: { children: React.ReactNode }) {
  const editors = useRef(new Map<string, DraftEditor>())

  const register = useCallback((key: string, editor: DraftEditor) => {
    editors.current.set(key, editor)
    return () => {
      editors.current.delete(key)
    }
  }, [])

  const settle = useCallback(async () => {
    const problems: string[] = []
    for (const editor of editors.current.values()) {
      const unsaved = editor.unsavedMessage?.()
      if (unsaved) problems.push(unsaved)
      if (editor.flush && !(await editor.flush())) {
        problems.push("Some field changes couldn't be saved. Retry from the Document tab.")
      }
    }
    return problems
  }, [])

  const value = useMemo(() => ({ register, settle }), [register, settle])
  return <DraftStateContext.Provider value={value}>{children}</DraftStateContext.Provider>
}

export function useDraftState(): DraftState | null {
  return useContext(DraftStateContext)
}

/** Register an editor for the lifetime of the component. The callbacks may change freely. */
export function useRegisterDraftEditor(key: string, editor: DraftEditor) {
  const draft = useDraftState()
  const latest = useRef(editor)
  latest.current = editor
  useEffect(
    () =>
      draft?.register(key, {
        flush: () => latest.current.flush?.() ?? Promise.resolve(true),
        unsavedMessage: () => latest.current.unsavedMessage?.() ?? null,
      }),
    [draft, key],
  )
}
