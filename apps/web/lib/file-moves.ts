import type { MovableKind } from "@sahihi/core"

/**
 * Drag and drop and multi-select on the All files page (ADR 0039). Pure helpers: which items a
 * drag carries, which folders may take them, and how to undo a move.
 */

/** Something the user can select, drag and move. `folderId` is where it is now (a folder's parent). */
export interface MovableItem {
  kind: MovableKind
  id: string
  name: string
  folderId: string | null
}

/** A place to drop: a folder (with its path, root first, ending with itself) or the top level. */
export interface DropTarget {
  folderId: string | null
  name: string
  /** Folder ids from the root down to the target itself; empty for the top level. */
  path: readonly string[]
}

export const itemKey = (item: { kind: MovableKind; id: string }) => `${item.kind}:${item.id}`

/** Selection with `key` flipped. */
export function toggleKey(selected: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(selected)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

/**
 * Shift-click: every key between the anchor (the last plain click) and `key`, both included, in
 * page order. Without an anchor on the page, just `key`.
 */
export function rangeKeys(order: readonly string[], anchor: string | null, key: string): string[] {
  const from = anchor ? order.indexOf(anchor) : -1
  const to = order.indexOf(key)
  if (to === -1) return []
  if (from === -1) return [key]
  const [start, end] = from < to ? [from, to] : [to, from]
  return order.slice(start, end + 1)
}

/**
 * What a drag carries: grabbing a selected item takes the whole selection (in page order);
 * grabbing anything else takes just that item.
 */
export function dragSet<T extends { kind: MovableKind; id: string }>(
  selected: ReadonlySet<string>,
  grabbed: T,
  items: readonly T[],
): T[] {
  if (!selected.has(itemKey(grabbed))) return [grabbed]
  return items.filter((i) => selected.has(itemKey(i)))
}

/**
 * Can `dragged` drop on `target`? Not a folder into itself or one of its subfolders, and not when
 * everything is already there. The API checks again (depth, names, permissions).
 */
export function canDrop(dragged: readonly MovableItem[], target: DropTarget): boolean {
  if (dragged.length === 0) return false
  if (dragged.some((i) => i.kind === "folder" && target.path.includes(i.id))) return false
  return dragged.some((i) => i.folderId !== target.folderId)
}

/**
 * Can `dragged` drop onto the file `onto` to make a new folder with it (ADR 0039)? Not onto
 * itself (or one of the dragged items), and only when `onto` may move too. The API checks folder
 * depth and cycles.
 */
export function canGroup(
  dragged: readonly MovableItem[],
  onto: MovableItem,
  ontoCanMove: boolean,
): boolean {
  if (dragged.length === 0 || !ontoCanMove) return false
  return !dragged.some((i) => i.kind === onto.kind && i.id === onto.id)
}

/** "“Lease.pdf”" or "3 items". */
export function dragLabel(dragged: readonly MovableItem[]): string {
  const [only] = dragged
  return dragged.length === 1 && only ? `“${only.name}”` : `${dragged.length} items`
}

/** The success toast's title: "Moved “Lease.pdf” to Archive", "Moved 3 items to the top level". */
export function movedTitle(dragged: readonly MovableItem[], target: DropTarget): string {
  return `Moved ${dragLabel(dragged)} to ${target.folderId ? target.name : "the top level"}`
}

export interface MovedFrom {
  kind: MovableKind
  id: string
  folderId: string | null
}

/** Undo: one `POST /files/move` per folder the items came from. */
export function undoMoves(from: readonly MovedFrom[]): {
  folderId: string | null
  items: { kind: MovableKind; id: string }[]
}[] {
  const groups = new Map<string | null, { kind: MovableKind; id: string }[]>()
  for (const { kind, id, folderId } of from) {
    groups.set(folderId, [...(groups.get(folderId) ?? []), { kind, id }])
  }
  return [...groups].map(([folderId, items]) => ({ folderId, items }))
}

/** The toast after grouping: "Made “New folder” with 2 items". */
export function groupedTitle(folderName: string, count: number): string {
  return `Made “${folderName}” with ${count} items`
}
