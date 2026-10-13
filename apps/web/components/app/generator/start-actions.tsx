"use client"

import { useRouter } from "next/navigation"
import { createContext, useContext, useState } from "react"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { ChevronRightIcon, LoaderIcon, PlusIcon, Trash2Icon } from "@/components/app/icons"
import { Button } from "@/components/arc/button/button"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { Button as IconButton } from "@/components/ui/button"
import { ApiError, api } from "@/lib/api"
import { cn } from "@/lib/utils"

/** Which start is creating its document: one at a time, so a double click can't make two. */
const Starting = createContext<{
  starting: string | null
  setStarting: (key: string | null) => void
} | null>(null)

export function StartGroup({ children }: { children: React.ReactNode }) {
  const [starting, setStarting] = useState<string | null>(null)
  return <Starting.Provider value={{ starting, setStarting }}>{children}</Starting.Provider>
}

/** Whether any start in the group is creating its document. */
export function useStarting() {
  return useContext(Starting)?.starting != null
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

/** Starts a document from `from` inside the group: busy for this one, blocked for the others. */
function useStart(from: StartFrom) {
  const router = useRouter()
  const group = useContext(Starting)
  const key = JSON.stringify(from)
  const [error, setError] = useState<string | null>(null)
  const start = async () => {
    group?.setStarting(key)
    setError(null)
    try {
      await startDocument(router, from)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start. Try again.")
      group?.setStarting(null)
    }
  }
  return { start, error, busy: group?.starting === key, blocked: group?.starting != null }
}

/** "Blank document": the page's primary action, beside Import in the header. */
export function StartBlankButton() {
  const { start, error, busy, blocked } = useStart({ blank: true })
  return (
    <>
      <Button loading={busy} disabled={blocked && !busy} onClick={() => void start()}>
        <PlusIcon aria-hidden />
        Blank document
      </Button>
      {error && (
        <span className="basis-full text-destructive-foreground text-sm sm:text-end" role="alert">
          {error}
        </span>
      )}
    </>
  )
}

/**
 * A starter or template as one pressable tile, in the tone of the file cards on All files (ADR 0033):
 * a muted card with no border, the type mark, the name and what it's for. The whole tile creates a
 * document from `from` and opens it in the generator. `actions` (e.g. delete) sit above the tile's
 * press surface.
 */
export function StartCard({
  from,
  icon,
  name,
  description,
  meta,
  actions,
}: {
  from: StartFrom
  icon: React.ReactNode
  name: string
  description?: string | null
  meta?: string
  actions?: React.ReactNode
}) {
  const { start, error, busy, blocked } = useStart(from)
  return (
    <li
      className={cn(
        "group relative isolate flex min-h-36 min-w-0 flex-col gap-3 rounded-2xl bg-muted p-4",
        "transition-[scale,box-shadow] duration-150 ease-out motion-safe:has-[>button:active:not(:disabled)]:scale-[0.985]",
        "[@media(hover:hover)]:has-[>button:hover:not(:disabled)]:shadow-(--shadow-raised)",
        // Hover tone: a foreground tint under the content, as on the file cards, in both themes.
        "before:-z-10 before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:bg-foreground/0 before:transition-colors has-[>button:hover:not(:disabled)]:before:bg-foreground/5",
        "has-[>button:focus-visible]:ring-2 has-[>button:focus-visible]:ring-ring",
      )}
    >
      <div className="flex h-6 items-center justify-between gap-2">
        {icon}
        <span className="flex shrink-0 items-center gap-1">
          {/* Above the press surface, so they stay their own buttons. */}
          {actions && <span className="relative z-10">{actions}</span>}
          {busy ? (
            <LoaderIcon aria-hidden className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <ChevronRightIcon
              aria-hidden
              className="size-4 text-muted-foreground transition-[translate] duration-150 ease-out group-has-[>button:hover:not(:disabled)]:translate-x-0.5"
            />
          )}
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate font-medium text-sm">{name}</span>
        {description && (
          <span className="line-clamp-3 text-muted-foreground text-sm">{description}</span>
        )}
      </div>
      {meta && <span className="mt-auto truncate text-muted-foreground text-xs">{meta}</span>}
      {error && (
        <span className="relative z-10 text-destructive-foreground text-sm" role="alert">
          {error}
        </span>
      )}
      {/* The tile's press surface: one button stretched over it. */}
      <button
        type="button"
        aria-label={`Start “${name}”`}
        aria-busy={busy}
        disabled={blocked}
        onClick={() => void start()}
        className="absolute inset-0 rounded-2xl outline-none disabled:cursor-progress"
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
