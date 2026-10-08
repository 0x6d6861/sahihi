"use client"

import { useDraggable, useDroppable } from "@dnd-kit/core"
import {
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
} from "react"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { canDrop, canGroup, type DropTarget, itemKey, type MovableItem } from "@/lib/file-moves"
import { cn } from "@/lib/utils"
import { useFilesDnd } from "./files-dnd"

/**
 * The draggable and droppable parts of All files (ADR 0039). Outside `FilesDnd` (the Documents,
 * Envelopes and Templates pages share folder rows and cards) each renders as before.
 */

interface DragProps {
  item: MovableItem
  /** Whether the user may move it (its ⋮ menu offers Move). */
  canMove: boolean
  /** Set on folders: what lands in them. Files without one take drops too: a new folder with both. */
  target?: DropTarget
}

// Mouse drags start on links and images; the browser's own drag of them would swallow the drag.
// A long press on iOS opens the link preview instead of starting a touch drag.
// Fade and highlight changes are short and eased: the pointer crosses many rows in one drag, so a
// slow transition would trail behind it, and none at all flickers between neighbouring rows.
const DRAG_SURFACE =
  "[-webkit-touch-callout:none] transition-[opacity,background-color,box-shadow] duration-(--duration-instant) ease-(--ease-standard)"
const OVER = "ring-2 ring-ring ring-inset bg-accent"

function useDragDrop({ item, canMove, target }: DragProps) {
  const dnd = useFilesDnd()
  const key = itemKey(item)
  const drag = useDraggable({
    id: key,
    data: { item },
    disabled: !dnd || !canMove,
  })
  const drop = useDroppable({
    id: `drop:${key}`,
    data: target ? { target } : { group: item, canMove },
    disabled: !dnd,
  })
  const dragging = Boolean(dnd?.dragged.some((d) => itemKey(d) === key))
  const over =
    (drop.isOver && dnd
      ? target
        ? canDrop(dnd.dragged, target)
        : canGroup(dnd.dragged, item, canMove)
      : false) || Boolean(target && dnd?.fileTarget && dnd.fileTarget.folderId === target.folderId)
  return {
    dnd,
    ref: (node: HTMLElement | null) => {
      drag.setNodeRef(node)
      drop.setNodeRef(node)
    },
    props: {
      ...(canMove ? drag.listeners : {}),
      "data-drop-target": target ? JSON.stringify(target) : undefined,
      onDragStart: (e: { preventDefault: () => void }) => e.preventDefault(),
      onClickCapture: (e: MouseEvent) => {
        if (dnd?.justDragged.current) {
          e.preventDefault()
          e.stopPropagation()
        }
      },
    },
    selected: Boolean(dnd?.selected.has(key)),
    // Moved away: gone at once, before the refresh catches up.
    hidden: Boolean(dnd?.moved.has(key)),
    dragging,
    over,
  }
}

/** A table row that drags (and, for a folder, takes drops). */
export function DragRow({
  item,
  canMove,
  target,
  className,
  children,
  ...rest
}: DragProps & ComponentProps<typeof TableRow>) {
  const { dnd, ref, props, selected, dragging, over, hidden } = useDragDrop({
    item,
    canMove,
    target,
  })
  if (!dnd) {
    return (
      <TableRow className={className} {...rest}>
        {children}
      </TableRow>
    )
  }
  return (
    <TableRow
      ref={ref}
      {...rest}
      {...props}
      data-state={selected ? "selected" : undefined}
      hidden={hidden}
      className={cn(DRAG_SURFACE, dragging && "opacity-50", over && OVER, className)}
    >
      {children}
    </TableRow>
  )
}

/** A grid tile (file card or folder card) that drags, with its checkbox in the top corner. */
export function DragCard({
  item,
  canMove,
  target,
  as: Tag = "li",
  className,
  selectClassName = "start-0 top-0",
  children,
}: DragProps & {
  as?: "li" | "div"
  className?: string
  /** Where the checkbox sits: over the card's type icon. */
  selectClassName?: string
  children: ReactNode
}) {
  const { dnd, ref, props, selected, dragging, over, hidden } = useDragDrop({
    item,
    canMove,
    target,
  })
  if (!dnd) return <Tag className={className}>{children}</Tag>
  const anySelected = dnd.selected.size > 0
  return (
    <Tag
      ref={ref}
      {...props}
      hidden={hidden}
      className={cn(
        "group/drag relative rounded-2xl",
        DRAG_SURFACE,
        dragging && "opacity-50",
        over && "ring-2 ring-ring",
        selected && "ring-2 ring-primary",
        className,
        // The page's own `grid` would beat the `hidden` attribute.
        hidden && "!hidden",
      )}
    >
      {children}
      {canMove && (
        // Over the card's type icon, on the card's own tone; shown on hover, focus or once anything is selected.
        <div
          className={cn(
            "absolute z-20 transition-opacity duration-(--duration-fast) ease-(--ease-standard)",
            selectClassName,
            // Touch has no hover: always shown there. (Tailwind's hover variants only apply on
            // devices that hover.)
            selected || anySelected
              ? "opacity-100"
              : "opacity-0 focus-within:opacity-100 group-hover/drag:opacity-100 pointer-coarse:opacity-100",
          )}
        >
          <SelectBox item={item} canMove={canMove} />
        </div>
      )}
    </Tag>
  )
}

/** The selection checkbox (shift-click selects a range). Keeps its place for items that can't move. */
export function SelectBox({ item, canMove }: DragProps) {
  const dnd = useFilesDnd()
  if (!dnd) return null
  if (!canMove) return <span aria-hidden className="w-5 shrink-0" />
  return (
    // Arc's checkbox has a 44 px hit area; the negative margin keeps the row height.
    <span className="-my-3 -ms-3 flex shrink-0">
      <Checkbox
        aria-label={`Select ${item.name}`}
        checked={dnd.selected.has(itemKey(item))}
        // Handled here rather than by Radix, for shift-click (Space still clicks it).
        onClick={(e) => {
          e.preventDefault()
          dnd.select(item, { shift: e.shiftKey })
        }}
      />
    </span>
  )
}

/** The list's first column: the row's checkbox (only on All files). */
export function SelectCell(props: DragProps) {
  const dnd = useFilesDnd()
  if (!dnd) return null
  return (
    <TableCell className="ps-3 pe-0">
      <SelectBox {...props} />
    </TableCell>
  )
}

/** Its header: select or clear every item on the page. */
export function SelectHead() {
  const dnd = useFilesDnd()
  if (!dnd) return null
  const all = dnd.items.length > 0 && dnd.items.every((i) => dnd.selected.has(itemKey(i)))
  const some = dnd.selected.size > 0
  return (
    <TableHead className="ps-3 pe-0">
      <span className="-my-3 -ms-3 flex">
        <Checkbox
          aria-label={all ? "Clear selection" : "Select everything on this page"}
          checked={all ? true : some ? "indeterminate" : false}
          disabled={dnd.items.length === 0}
          onClick={(e) => {
            e.preventDefault()
            if (all) dnd.clear()
            else dnd.selectAll()
          }}
        />
      </span>
    </TableHead>
  )
}

/**
 * Breadcrumb crumbs as drop targets: the page's top level and every ancestor of the open folder.
 * Arc's `Breadcrumb` takes items, not elements, so each target attaches to its rendered link.
 */
export function BreadcrumbDrops({
  targets,
  children,
}: {
  targets: DropTarget[]
  children: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const dnd = useFilesDnd()
  return (
    <div
      ref={box}
      className="[&_a]:transition-[background-color,box-shadow] [&_a]:duration-(--duration-instant) [&_a]:ease-(--ease-standard) [&_a[data-drop-over]]:rounded-md [&_a[data-drop-over]]:bg-accent [&_a[data-drop-over]]:ring-2 [&_a[data-drop-over]]:ring-ring"
    >
      {children}
      {dnd &&
        targets.map((t, i) => (
          <CrumbDrop key={t.folderId ?? "root"} box={box} index={i} target={t} />
        ))}
    </div>
  )
}

function CrumbDrop({
  box,
  index,
  target,
}: {
  box: RefObject<HTMLDivElement | null>
  index: number
  target: DropTarget
}) {
  const dnd = useFilesDnd()
  const { setNodeRef, isOver } = useDroppable({
    id: `drop:crumb:${target.folderId ?? "root"}`,
    data: { target },
  })
  const over =
    (isOver && dnd ? canDrop(dnd.dragged, target) : false) ||
    Boolean(dnd?.fileTarget && dnd.fileTarget.folderId === target.folderId)

  useEffect(() => {
    const link = box.current?.querySelectorAll("a[data-label]")[index] ?? null
    if (!link) return
    setNodeRef(link as HTMLElement)
    link.setAttribute("data-drop-target", JSON.stringify(target))
    return () => {
      setNodeRef(null)
      link.removeAttribute("data-drop-target")
    }
  }, [box, index, target, setNodeRef])

  useEffect(() => {
    const link = box.current?.querySelectorAll("a[data-label]")[index]
    if (!link) return
    if (over) link.setAttribute("data-drop-over", "")
    else link.removeAttribute("data-drop-over")
  }, [box, index, over])

  return null
}
