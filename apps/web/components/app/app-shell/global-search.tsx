"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import type { SearchIndex, SearchItem } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  FileSearchIcon,
  FileTextIcon,
  FolderIcon,
  LayoutTemplateIcon,
  MailIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
} from "@/components/app/icons"
import { type CommandItem, CommandPalette } from "@/components/arc/command-palette/command-palette"
import { Dialog, DialogPopup, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { api } from "@/lib/api"
import { type SearchEntry, searchEntries } from "@/lib/global-search"
import type { AppNavHref } from "@/lib/nav"
import { NAV_ICONS } from "./nav-icons"

const ICONS: Record<Exclude<SearchEntry["icon"], "page">, React.ReactNode> = {
  folder: <FolderIcon aria-hidden />,
  document: <FileTextIcon aria-hidden />,
  envelope: <MailIcon aria-hidden />,
  template: <LayoutTemplateIcon aria-hidden />,
  draft: <SparklesIcon aria-hidden />,
  settings: <SettingsIcon aria-hidden />,
  create: <PlusIcon aria-hidden />,
  search: <FileSearchIcon aria-hidden />,
}

/** Reload the index when the palette opens after this long, so new files show up. */
const STALE_MS = 30_000

/**
 * Global search in the top bar (ADR 0056): a search-field-shaped trigger, and ⌘K / Ctrl+K from
 * anywhere, open Arc's command palette as a dialog. Pages, settings and "create"
 * actions are always there; typing adds the workspace's folders, documents, envelopes, templates and drafts
 * (`GET /api/search`, loaded on open) and a full search on All files.
 */
export function GlobalSearch({ workspaceId }: { workspaceId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [items, setItems] = useState<SearchItem[] | null>(null)
  const loadedAt = useRef(0)
  const current = useRef(workspaceId)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // The index belongs to one workspace: drop it on a switch, so the palette never lists another
  // workspace's names and a response still in flight for the old one is ignored.
  useEffect(() => {
    current.current = workspaceId
    loadedAt.current = 0
    setItems(null)
  }, [workspaceId])

  const load = useCallback(async () => {
    if (Date.now() - loadedAt.current < STALE_MS) return
    loadedAt.current = Date.now()
    const forWorkspace = workspaceId
    try {
      const index = await api<SearchIndex>("/search")
      if (current.current === forWorkspace) setItems(index.items)
    } catch {
      // Pages and actions still work; the next open tries again.
      if (current.current === forWorkspace) loadedAt.current = 0
    }
  }, [workspaceId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (open) void load()
    else setQuery("")
  }, [open, load])

  const entries = useMemo(() => searchEntries(query, items), [query, items])
  const commands: CommandItem[] = useMemo(
    () =>
      entries.map(({ href, icon, ...entry }) => ({
        ...entry,
        icon:
          icon === "page" ? (
            <HugeiconsIcon icon={NAV_ICONS[href as AppNavHref]} size={16} aria-hidden />
          ) : (
            ICONS[icon]
          ),
      })),
    [entries],
  )

  function select(item: CommandItem) {
    const entry = entries.find((e) => e.id === item.id)
    if (!entry) return
    setOpen(false)
    router.push(entry.href)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-keyshortcuts="Meta+K Control+K"
        className="press-subtle flex h-9 w-full min-w-0 items-center gap-2 rounded-full bg-muted ps-3 pe-1.5 text-muted-foreground text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)]:hover:text-foreground"
      >
        <SearchIcon aria-hidden className="shrink-0" />
        <span className="flex-1 truncate text-start">Search</span>
        <Kbd className="max-sm:hidden">⌘K</Kbd>
      </button>
      <Dialog
        open={open}
        onOpenChange={(next, details) => {
          // Escape clears a typed query first (the palette does that itself) and closes only once
          // the field is empty, as in Arc's palette on its own.
          if (!next && details.reason === "escape-key" && query.trim()) {
            details.cancel()
            setQuery("")
            return
          }
          setOpen(next)
        }}
      >
        {/* The palette is the dialog: coss's popup (Base UI: backdrop, focus trap, Escape, focus
            back to the field) with its own frame removed, since Arc's palette draws its card. Arc's
            DialogContent always adds a titled header, hence coss here (ADR 0056). */}
        <DialogPopup
          showCloseButton={false}
          finalFocus={triggerRef}
          bottomStickOnMobile={false}
          className="max-w-xl rounded-none border-0 bg-transparent shadow-none before:hidden"
        >
          <DialogTitle className="sr-only">Search</DialogTitle>
          {/* The palette keeps its query to itself; reading it from the input lets the list grow
              with the workspace's items only once something is typed. */}
          <div onInput={(e) => setQuery((e.target as HTMLInputElement).value)}>
            <CommandPalette
              autoFocus
              label="Search Sahihi"
              placeholder="Search files, envelopes, people and settings"
              items={commands}
              onSelect={select}
              onClose={() => setOpen(false)}
            />
          </div>
          {/* Key hints under the palette (the redesign's footer); keyboards only, so not on phones. */}
          <div
            aria-hidden
            className="mx-auto mt-2 flex w-fit items-center gap-4 rounded-full border bg-popover px-3 py-1.5 text-muted-foreground text-xs max-sm:hidden"
          >
            <span className="flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              to move
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>↵</Kbd>
              to open
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>esc</Kbd>
              to close
            </span>
          </div>
        </DialogPopup>
      </Dialog>
    </>
  )
}
