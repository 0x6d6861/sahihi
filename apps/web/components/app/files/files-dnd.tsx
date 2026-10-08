"use client"

import {
  type Announcements,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  type DropAnimation,
  type Modifier,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { useRouter } from "next/navigation"
import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useBatchUpload } from "@/app/(app)/documents/use-document-upload"
import { FolderIcon, PdfIcon, UploadIcon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { api } from "@/lib/api"
import {
  canDrop,
  canGroup,
  type DropTarget,
  dragLabel,
  dragSet,
  groupedTitle,
  itemKey,
  type MovableItem,
  type MovedFrom,
  movedTitle,
  rangeKeys,
  toggleKey,
  undoMoves,
} from "@/lib/file-moves"
import { SelectionBar } from "./selection-bar"

/**
 * Drag and drop and multi-select on All files (ADR 0039, docs/ui.md → Drag and drop). Rows and
 * cards drag onto folders (and breadcrumb crumbs), or onto another item to make a new folder with
 * it, with dnd-kit: mouse after 6 px, touch after a
 * 250 ms press. A drag carries the selection when it starts on a selected item. The keyboard path
 * is the checkbox and the selection bar's "Move…". PDFs dragged in from the desktop upload into
 * the folder under the pointer, or the open one.
 */

interface FilesDndValue {
  items: readonly MovableItem[]
  selected: ReadonlySet<string>
  /** Plain click toggles; shift-click selects the range from the last plain click. */
  select: (item: MovableItem, opts: { shift: boolean }) => void
  selectAll: () => void
  clear: () => void
  /** Items being dragged (empty when no drag runs). */
  dragged: readonly MovableItem[]
  /** Desktop files are over this target. */
  fileTarget: DropTarget | null
  /** Moved items (by key) still on the page until the refresh lands: hidden right away. */
  moved: ReadonlySet<string>
  /** Swallows the click that ends a drag over the item it started on (it would open it). */
  justDragged: RefObject<boolean>
  /** Moves and offers Undo; throws when the API refuses (the caller says so). */
  move: (items: readonly MovableItem[], target: DropTarget) => Promise<void>
}

const FilesDndContext = createContext<FilesDndValue | null>(null)

/** Null outside All files: the shared folder rows and cards then render without drag and drop. */
export const useFilesDnd = () => useContext(FilesDndContext)

/** Where the pointer was when the drag began, so the overlay chip sits beside it. */
function pointOf(event: Event | null): { x: number; y: number } | null {
  if (!event) return null
  if ("touches" in event) {
    const touch = (event as TouchEvent).touches[0] ?? (event as TouchEvent).changedTouches[0]
    return touch ? { x: touch.clientX, y: touch.clientY } : null
  }
  if ("clientX" in event)
    return { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY }
  return null
}

const besideCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  const point = pointOf(activatorEvent)
  if (!point || !draggingNodeRect) return transform
  return {
    ...transform,
    x: transform.x + point.x - draggingNodeRect.left + 12,
    y: transform.y + point.y - draggingNodeRect.top + 12,
  }
}

type Transform = { x: number; y: number; scaleX: number; scaleY: number }
const toCss = (t: Transform, scale = 1) =>
  `translate3d(${t.x}px, ${t.y}px, 0) scale(${t.scaleX * scale}, ${t.scaleY * scale})`

// Arc's --ease-standard; WAAPI can't read CSS variables.
const EASE_STANDARD = "cubic-bezier(.22,1,.36,1)"

/** Dropped on a folder: the chip settles where it was let go (the item already left the list). */
const DROP_INTO: DropAnimation = {
  duration: 120,
  easing: EASE_STANDARD,
  keyframes: ({ transform }) => [
    { opacity: 1, transform: toCss(transform.initial) },
    { opacity: 0, transform: toCss(transform.initial, 0.95) },
  ],
  sideEffects: null,
}

/** Dropped anywhere else: the chip glides back to the item, so it's clear nothing moved. */
const DROP_BACK: DropAnimation = { duration: 200, easing: EASE_STANDARD }

const SCREEN_READER_INSTRUCTIONS = {
  draggable:
    "Drag onto a folder to move it, or onto another item to put both in a new folder. With the keyboard, select it with its checkbox and choose Move.",
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

export function FilesDnd({
  items,
  current,
  resetKey,
  fileDrop = true,
  hideMoved = true,
  children,
}: {
  /** What the page shows, in page order (folders first), for ranges and drags. */
  items: MovableItem[]
  /** The open folder (or the top level): desktop files dropped outside a folder land here. */
  current: DropTarget
  /** Changes when the folder, page or filters change; the selection starts over. */
  resetKey: string
  /** Off on the empty page, whose drop zone takes desktop files itself. */
  fileDrop?: boolean
  /** Hide moved items at once; off while searching, where they stay listed in their new folder. */
  hideMoved?: boolean
  children: ReactNode
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [dragged, setDragged] = useState<readonly MovableItem[]>([])
  const [fileTarget, setFileTarget] = useState<DropTarget | null>(null)
  const [moved, setMoved] = useState<ReadonlySet<string>>(() => new Set())
  // Whether the drop moves something. Chosen at drop time and kept until the next drag: dnd-kit
  // reads the drop animation on the render after the drop, when the moved item is already hidden
  // (gliding "back" to a hidden item would aim at 0,0, the window's corner).
  const [dropMoves, setDropMoves] = useState(false)
  const anchor = useRef<string | null>(null)
  const justDragged = useRef(false)
  const { uploadMany } = useBatchUpload()

  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey is the trigger
  useEffect(() => {
    setSelected(new Set())
    anchor.current = null
  }, [resetKey])

  // After a refresh, drop what's no longer on the page.
  useEffect(() => {
    const keys = new Set(items.map(itemKey))
    setSelected((prev) => {
      const kept = [...prev].filter((k) => keys.has(k))
      return kept.length === prev.size ? prev : new Set(kept)
    })
    setMoved((prev) => {
      const kept = [...prev].filter((k) => keys.has(k))
      return kept.length === prev.size ? prev : new Set(kept)
    })
  }, [items])

  const clear = useCallback(() => {
    setSelected(new Set())
    anchor.current = null
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="dialog"]')) clear()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [clear])

  const select = useCallback(
    (item: MovableItem, { shift }: { shift: boolean }) => {
      const key = itemKey(item)
      if (shift && anchor.current) {
        const range = rangeKeys(items.map(itemKey), anchor.current, key)
        setSelected((prev) => new Set([...prev, ...range]))
        return
      }
      anchor.current = key
      setSelected((prev) => toggleKey(prev, key))
    },
    [items],
  )

  const selectAll = useCallback(() => setSelected(new Set(items.map(itemKey))), [items])

  const move = useCallback(
    async (moving: readonly MovableItem[], target: DropTarget) => {
      const keys = moving.map(itemKey)
      if (hideMoved) setMoved((prev) => new Set([...prev, ...keys]))
      let from: MovedFrom[]
      try {
        ;({ from } = await api<{ moved: number; from: MovedFrom[] }>("/files/move", {
          method: "POST",
          json: { items: moving.map(({ kind, id }) => ({ kind, id })), folderId: target.folderId },
        }))
      } catch (err) {
        // Refused: put them back where they were.
        setMoved((prev) => new Set([...prev].filter((k) => !keys.includes(k))))
        throw err
      }
      clear()
      toastManager.add({
        title: movedTitle(moving, target),
        type: "success",
        action: {
          label: "Undo",
          onClick: (toast) => {
            toastManager.update(toast, {
              title: "Moving back…",
              type: "loading",
              action: undefined,
            })
            void (async () => {
              try {
                for (const group of undoMoves(from)) {
                  await api("/files/move", { method: "POST", json: group })
                }
                toastManager.update(toast, { title: "Move undone", type: "success" })
              } catch (err) {
                toastManager.update(toast, {
                  title: "Couldn't undo the move",
                  description: err instanceof Error ? err.message : undefined,
                  type: "error",
                })
              }
              router.refresh()
            })()
          },
        },
      })
      router.refresh()
    },
    [clear, router, hideMoved],
  )

  /** Drop onto a file: a new folder where it sits, holding it and everything dragged. */
  const group = useCallback(
    async (moving: readonly MovableItem[], onto: MovableItem) => {
      const all = [onto, ...moving]
      const keys = all.map(itemKey)
      if (hideMoved) setMoved((prev) => new Set([...prev, ...keys]))
      let result: { folder: { id: string; name: string }; from: MovedFrom[] }
      try {
        result = await api("/files/group", {
          method: "POST",
          json: { items: all.map(({ kind, id }) => ({ kind, id })), parentId: onto.folderId },
        })
      } catch (err) {
        setMoved((prev) => new Set([...prev].filter((k) => !keys.includes(k))))
        throw err
      }
      const { folder, from } = result
      clear()
      toastManager.add({
        title: groupedTitle(folder.name, all.length),
        description: "Rename it from its ⋮ menu.",
        type: "success",
        action: {
          label: "Undo",
          onClick: (toast) => {
            toastManager.update(toast, { title: "Undoing…", type: "loading", action: undefined })
            void (async () => {
              try {
                for (const g of undoMoves(from)) {
                  await api("/files/move", { method: "POST", json: g })
                }
                await api(`/folders/${folder.id}`, { method: "DELETE" })
                toastManager.update(toast, { title: "Folder removed", type: "success" })
              } catch (err) {
                toastManager.update(toast, {
                  title: "Couldn't undo",
                  description: err instanceof Error ? err.message : undefined,
                  type: "error",
                })
              }
              router.refresh()
            })()
          },
        },
      })
      router.refresh()
    },
    [clear, router, hideMoved],
  )

  // Desktop files: native drag events (dnd-kit only sees pointer drags inside the page). The
  // target is the nearest `data-drop-target` under the pointer (folder rows, cards, crumbs).
  useEffect(() => {
    if (!fileDrop) return
    let depth = 0
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false
    // An open dialog (Upload document) has its own drop zone.
    const dialogOpen = () => Boolean(document.querySelector('[role="dialog"]'))
    const targetOf = (e: DragEvent): DropTarget => {
      const el = e.target instanceof Element ? e.target.closest("[data-drop-target]") : null
      const raw = el?.getAttribute("data-drop-target")
      return raw ? (JSON.parse(raw) as DropTarget) : current
    }
    const show = (target: DropTarget | null) =>
      setFileTarget((prev) =>
        prev?.folderId === target?.folderId && prev?.name === target?.name ? prev : target,
      )

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e) || dialogOpen()) return
      depth += 1
      show(targetOf(e))
    }
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e) || dialogOpen()) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"
      show(targetOf(e))
    }
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) show(null)
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = 0
      show(null)
      if (e.defaultPrevented || dialogOpen()) return
      e.preventDefault()
      const target = targetOf(e)
      const files = [...(e.dataTransfer?.files ?? [])]
      if (files.length > 0) void uploadMany(files, target.folderId, target.name)
    }
    window.addEventListener("dragenter", onEnter)
    window.addEventListener("dragover", onOver)
    window.addEventListener("dragleave", onLeave)
    window.addEventListener("drop", onDrop)
    return () => {
      window.removeEventListener("dragenter", onEnter)
      window.removeEventListener("dragover", onOver)
      window.removeEventListener("dragleave", onLeave)
      window.removeEventListener("drop", onDrop)
      show(null)
    }
  }, [fileDrop, current, uploadMany])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  const itemOf = (data: unknown) => (data as { item?: MovableItem } | undefined)?.item
  const targetOf = (data: unknown) => (data as { target?: DropTarget } | undefined)?.target
  /** A file under the pointer: dropping makes a new folder with it. */
  const groupOf = (data: unknown) => {
    const d = data as { group?: MovableItem; canMove?: boolean } | undefined
    return d?.group ? { onto: d.group, canMove: Boolean(d.canMove) } : undefined
  }

  function onDragStart(e: DragStartEvent) {
    const item = itemOf(e.active.data.current)
    if (item) setDragged(dragSet(selected, item, items))
    setDropMoves(false)
  }

  function endDrag() {
    setDragged([])
    justDragged.current = true
    setTimeout(() => {
      justDragged.current = false
    }, 0)
  }

  function onDragEnd(e: DragEndEvent) {
    const moving = dragged
    const target = targetOf(e.over?.data.current)
    const onto = groupOf(e.over?.data.current)
    const groups = Boolean(onto && canGroup(moving, onto.onto, onto.canMove))
    const moves = groups || Boolean(target && canDrop(moving, target))
    setDropMoves(moves)
    endDrag()
    if (!moves) return
    const done = onto && groups ? group(moving, onto.onto) : move(moving, target as DropTarget)
    done.catch((err: unknown) =>
      toastManager.add({
        title: "Not moved",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      }),
    )
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const item = itemOf(active.data.current)
      return item ? `Picked up ${dragLabel(dragSet(selected, item, items))}.` : ""
    },
    onDragOver: ({ over }) => {
      const target = targetOf(over?.data.current)
      const onto = groupOf(over?.data.current)
      if (target) return `Over ${target.name}.`
      if (onto) return `Over ${onto.onto.name}. Drop to put both in a new folder.`
      return "Not over a folder."
    },
    onDragEnd: ({ over }) => {
      const target = targetOf(over?.data.current)
      const onto = groupOf(over?.data.current)
      if (target) return `Dropped on ${target.name}.`
      if (onto) return `Dropped on ${onto.onto.name}: making a new folder.`
      return "Dropped. Nothing moved."
    },
    onDragCancel: () => "Drag cancelled. Nothing moved.",
  }

  const value = useMemo<FilesDndValue>(
    () => ({
      items,
      selected,
      select,
      selectAll,
      clear,
      dragged,
      fileTarget,
      moved,
      justDragged,
      move,
    }),
    [items, selected, select, selectAll, clear, dragged, fileTarget, moved, move],
  )

  const [first] = dragged
  return (
    <FilesDndContext.Provider value={value}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setDropMoves(false)
          endDrag()
        }}
        accessibility={{ announcements, screenReaderInstructions: SCREEN_READER_INSTRUCTIONS }}
      >
        {children}
        <DragOverlay
          dropAnimation={reducedMotion() ? null : dropMoves ? DROP_INTO : DROP_BACK}
          modifiers={[besideCursor]}
        >
          {first ? (
            // Lifts in from 95 %; several items show a second card behind, like a small stack.
            <div className="relative inline-flex max-w-64 transition-[opacity,scale] duration-(--duration-instant) ease-(--ease-enter) starting:scale-95 starting:opacity-0 motion-reduce:starting:scale-100">
              {dragged.length > 1 && (
                <div
                  aria-hidden
                  className="-z-10 absolute inset-0 translate-x-1 translate-y-1 rounded-lg border bg-popover shadow-sm"
                />
              )}
              <div className="inline-flex min-w-0 items-center gap-2 rounded-lg border bg-popover px-3 py-2 font-medium text-popover-foreground text-sm shadow-lg">
                {first.kind === "folder" && dragged.length === 1 ? (
                  <FolderIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <PdfIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">
                  {dragged.length === 1 ? first.name : `${dragged.length} items`}
                </span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <SelectionBar />
      {fileTarget && (
        <>
          <div
            aria-hidden
            className="pointer-events-none fixed inset-2 z-50 rounded-2xl border-2 border-primary border-dashed transition-opacity duration-(--duration-fast) ease-(--ease-enter) starting:opacity-0"
          />
          <div
            role="status"
            className="pointer-events-none fixed inset-x-0 bottom-6 z-50 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-2 rounded-full bg-primary px-4 py-2 font-medium text-primary-foreground text-sm shadow-lg transition-[opacity,translate] duration-(--duration-fast) ease-(--ease-enter) starting:translate-y-2 starting:opacity-0 motion-reduce:starting:translate-y-0"
          >
            <UploadIcon aria-hidden className="size-4 shrink-0" />
            <span className="truncate">
              Drop PDFs to upload to {fileTarget.folderId ? fileTarget.name : "the top level"}
            </span>
          </div>
        </>
      )}
    </FilesDndContext.Provider>
  )
}
