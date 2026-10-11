"use client"

import { useRouter } from "next/navigation"
import { createContext, useContext, useState } from "react"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { ChevronRightIcon, LoaderIcon, Trash2Icon } from "@/components/app/icons"
import { Button } from "@/components/arc/button/button"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { Button as IconButton } from "@/components/ui/button"
import { ApiError, api } from "@/lib/api"

/** Which card is creating its document: one at a time, so a double click can't make two. */
const Starting = createContext<{
  starting: string | null
  setStarting: (key: string | null) => void
} | null>(null)

export function StartGroup({ children }: { children: React.ReactNode }) {
  const [starting, setStarting] = useState<string | null>(null)
  return <Starting.Provider value={{ starting, setStarting }}>{children}</Starting.Provider>
}

/** What a new document starts from (`POST /generated-documents`). */
export type StartFrom =
  | { starter: string }
  | { templateId: string }
  | { blank: true }
  | { documentId: string }

/** Creates a document and opens it in the generator; throws ApiError. */
export async function startDocument(router: ReturnType<typeof useRouter>, from: StartFrom) {
  const { id } = await api<{ id: string }>("/generated-documents", { method: "POST", json: from })
  router.push(`/generate/${id}`)
}

/**
 * A way to start a document as one pressable card: the whole card creates a document from `from`
 * and opens it in the generator, or calls `onPress` (to open a dialog first). `actions` (e.g.
 * delete) sit above the card's press surface.
 */
export function StartCard({
  from,
  onPress,
  name,
  description,
  meta,
  actions,
}: {
  name: string
  description?: string | null
  meta?: string
  actions?: React.ReactNode
} & ({ from: StartFrom; onPress?: never } | { from?: never; onPress: () => void })) {
  const router = useRouter()
  const group = useContext(Starting)
  const key = from ? JSON.stringify(from) : `press:${name}`
  const [error, setError] = useState<string | null>(null)
  const busy = group?.starting === key
  const start = async () => {
    if (!from) {
      onPress?.()
      return
    }
    group?.setStarting(key)
    setError(null)
    try {
      await startDocument(router, from)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start. Try again.")
      group?.setStarting(null)
    }
  }
  return (
    <li className="group relative flex flex-col gap-1 rounded-xl border p-4 transition-[background-color,scale] duration-150 ease-out hover:bg-muted/40 has-[>button:active:not(:disabled)]:scale-[0.98]">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-medium">{name}</span>
        <span className="flex shrink-0 items-center gap-1">
          {/* Above the press surface, so they stay their own buttons. */}
          {actions && <span className="relative z-10">{actions}</span>}
          {busy ? (
            <LoaderIcon aria-hidden className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <ChevronRightIcon
              aria-hidden
              className="size-4 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-0.5"
            />
          )}
        </span>
      </div>
      {description && <span className="text-muted-foreground text-sm">{description}</span>}
      {meta && <span className="text-muted-foreground text-xs">{meta}</span>}
      {error && (
        <span className="relative z-10 text-destructive-foreground text-sm" role="alert">
          {error}
        </span>
      )}
      {/* The card's press surface: one button stretched over it. */}
      <button
        type="button"
        aria-label={from ? `Start “${name}”` : name}
        aria-busy={busy}
        disabled={group?.starting != null}
        onClick={() => void start()}
        className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-progress"
      />
    </li>
  )
}

/** Owners and admins: turn the assistant on for the workspace. */
export function EnableAssistant() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            await api("/generated-documents/settings", { method: "PUT", json: { enabled: true } })
            router.refresh()
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Couldn't turn it on. Try again.")
          } finally {
            setBusy(false)
          }
        }}
      >
        Turn on for this workspace
      </Button>
      {error && <span className="text-destructive-foreground text-sm">{error}</span>}
    </div>
  )
}

/** Deletes a workspace template; documents started from it keep their text. */
export function DeleteTemplate({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <Tooltip content="Delete template">
        <IconButton
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete template ${name}`}
          onClick={() => setOpen(true)}
        >
          <Trash2Icon aria-hidden />
        </IconButton>
      </Tooltip>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setError(null)
        }}
        title={`Delete “${name}”?`}
        description="No one can start from it anymore. Documents already started from it stay as they are."
        confirmLabel="Delete template"
        onConfirm={async () => {
          setError(null)
          try {
            await api(`/generated-documents/templates/${encodeURIComponent(id)}`, {
              method: "DELETE",
            })
            router.refresh()
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Couldn't delete it. Try again.")
            throw err
          }
        }}
      >
        {error && (
          <p className="text-destructive-foreground text-sm" role="alert">
            {error}
          </p>
        )}
      </ConfirmDialog>
    </>
  )
}
