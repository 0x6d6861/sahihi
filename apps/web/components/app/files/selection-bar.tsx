"use client"

import { useRef, useState } from "react"
import { MoveToFolderDialog } from "@/components/app/folders/move-to-folder-dialog"
import { FolderInputIcon, XIcon } from "@/components/app/icons"
import { Button } from "@/components/arc/button/button"
import { itemKey } from "@/lib/file-moves"
import { pluralize } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useFilesDnd } from "./files-dnd"

/**
 * Floating bar while items are selected on All files (ADR 0039): how many, select the whole page,
 * Move… (the keyboard way to do what a drag does) and clear. Esc clears too.
 */
export function SelectionBar() {
  const dnd = useFilesDnd()
  const [moving, setMoving] = useState(false)
  // The count the bar showed last, so it doesn't read "0 selected" while it slides away.
  const shown = useRef(0)
  if (!dnd) return null

  const chosen = dnd.items.filter((i) => dnd.selected.has(itemKey(i)))
  const origins = new Set(chosen.map((i) => i.folderId))
  const [only] = origins
  const folders = chosen.filter((i) => i.kind === "folder").map((i) => i.id)
  const label = pluralize(chosen.length, "item")
  const open = chosen.length > 0
  if (open) shown.current = chosen.length

  return (
    <>
      {/* Room at the end of the page so the bar never covers the last row or the pagination. */}
      {open && <div aria-hidden className="h-16" />}
      {/* Always mounted so it can slide in and out: up from 8 px on the enter curve, back down a
          little faster when the selection clears. Inert while hidden. */}
      <div
        role="toolbar"
        aria-label="Selected items"
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-1 rounded-xl border bg-popover py-1.5 ps-4 pe-1.5 text-popover-foreground shadow-lg",
          "transition-[opacity,translate] motion-reduce:translate-y-0",
          open
            ? "duration-(--duration-fast) ease-(--ease-enter)"
            : "pointer-events-none translate-y-2 opacity-0 duration-(--duration-instant) ease-(--ease-standard)",
        )}
      >
        <p className="me-2 whitespace-nowrap font-medium text-sm tabular-nums" aria-live="polite">
          {open ? chosen.length : shown.current} selected
        </p>
        {chosen.length < dnd.items.length && (
          <Button variant="ghost" size="sm" onClick={dnd.selectAll}>
            Select all
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => setMoving(true)}>
          <FolderInputIcon aria-hidden />
          Move…
        </Button>
        <Button variant="ghost" size="sm" onClick={dnd.clear}>
          <XIcon aria-hidden />
          Clear
        </Button>
      </div>
      <MoveToFolderDialog
        open={moving}
        onOpenChange={setMoving}
        itemName={chosen.length === 1 ? (chosen[0]?.name ?? label) : label}
        title={chosen.length === 1 ? undefined : `Move ${label}`}
        currentFolderId={origins.size === 1 ? only : undefined}
        excludeSubtreeOf={folders}
        onMove={(folderId, name) => dnd.move(chosen, { folderId, name, path: [] })}
      />
    </>
  )
}
