"use client"

import type { NormalizedRect } from "@sahihi/core"
import { useRef, useState } from "react"
import { FIELD_LABEL_CLASS, FIELD_LABELS, RECIPIENT_COLORS } from "@/lib/constants"
import { keyToAction, localPoint, placementRect } from "@/lib/field-editor"
import {
  displayedToLocalRect,
  localToDisplayedPoint,
  type Point,
  rectStyle,
  resizeRect,
  uprightContentStyle,
} from "@/lib/field-geometry"
import { cn } from "@/lib/utils"
import { useFieldEditor } from "./context"

type Drag =
  | { kind: "draw"; from: Point }
  // `last` is set by the first captured move (see onPointerDown).
  | { kind: "move"; key: string; last: Point | null }
  | { kind: "resize"; key: string; last: Point | null }

/**
 * Pointer position in the layer's LOCAL box. The layer sits inside EmbedPDF's rotate wrapper, whose
 * local frame is the page before its own /Rotate, and which a view rotation turns further, so
 * getBoundingClientRect() would be wrong. offsetX/Y are measured in the target's own
 * (untransformed) box; walking offsetParent up to the layer converts to layer-local. Callers then
 * map to the displayed frame with localToDisplayedPoint (the frame fields are stored in).
 */
function layerPoint(e: React.PointerEvent, layer: HTMLElement): Point {
  let x = e.nativeEvent.offsetX
  let y = e.nativeEvent.offsetY
  let el = e.target as HTMLElement | null
  while (el && el !== layer) {
    x += el.offsetLeft
    y += el.offsetTop
    el = el.offsetParent as HTMLElement | null
  }
  return localPoint(x, y, layer.offsetWidth, layer.offsetHeight)
}

/**
 * Our fields for one page, rendered through PDFEditor's `renderPageOverlay`. Pointer handling runs
 * in React capture handlers and stops propagation there, before EmbedPDF's native listeners on the
 * page (text selection, pan) can react. Keys are handled on the focused field and stopped before
 * the editor's own shortcuts.
 */
export function FieldLayer({ pageNumber }: { pageNumber: number }) {
  const {
    state,
    dispatch,
    tool,
    activeRecipientId,
    placed,
    recipients,
    rotationOf,
    activeDocument,
  } = useFieldEditor()
  const rot = rotationOf(pageNumber)
  const layerRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [preview, setPreview] = useState<NormalizedRect | null>(null)
  const fields = state.fields.filter(
    (f) => f.page === pageNumber && f.envelopeDocumentId === activeDocument.id,
  )
  const placing = tool !== null && activeRecipientId !== null

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const layer = layerRef.current
    if (!layer || e.button !== 0) return
    e.stopPropagation()
    const target = e.target as HTMLElement
    const fieldEl = target.closest<HTMLElement>("[data-field-key]")

    if (fieldEl) {
      const key = fieldEl.dataset.fieldKey as string
      dispatch({ type: "select", key })
      fieldEl.focus({ preventScroll: true })
      // Children (label, resize handle) are counter-rotated, so their offsets can't be trusted.
      // Capture on the field itself and anchor on the first move, whose target is the field.
      drag.current = {
        kind: target.closest("[data-handle]") ? "resize" : "move",
        key,
        last: null,
      }
      fieldEl.setPointerCapture(e.pointerId)
      e.preventDefault()
      return
    }
    if (placing) {
      drag.current = { kind: "draw", from: localToDisplayedPoint(layerPoint(e, layer), rot) }
      layer.setPointerCapture(e.pointerId)
      e.preventDefault()
      return
    }
    dispatch({ type: "select", key: null })
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const layer = layerRef.current
    const d = drag.current
    if (!layer || !d) return
    e.stopPropagation()
    const p = localToDisplayedPoint(layerPoint(e, layer), rot)
    if (d.kind === "draw") {
      if (tool) setPreview(placementRect(tool, d.from, p))
      return
    }
    if (!d.last) {
      d.last = p
      return
    }
    const dx = p.x - d.last.x
    const dy = p.y - d.last.y
    if (dx === 0 && dy === 0) return
    d.last = p
    if (d.kind === "move") dispatch({ type: "move", key: d.key, dx, dy })
    else {
      const f = state.fields.find((x) => x.key === d.key)
      if (f) dispatch({ type: "setRect", key: d.key, rect: resizeRect(f, dx, dy) })
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const layer = layerRef.current
    const d = drag.current
    if (!layer || !d) return
    e.stopPropagation()
    drag.current = null
    setPreview(null)
    if (d.kind === "draw" && tool && activeRecipientId) {
      dispatch({
        type: "place",
        envelopeDocumentId: activeDocument.id,
        page: pageNumber,
        recipientId: activeRecipientId,
        fieldType: tool,
        from: d.from,
        to: localToDisplayedPoint(layerPoint(e, layer), rot),
      })
      placed(e.shiftKey)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    const action = keyToAction(e.key, e.shiftKey, state.selected)
    if (!action) return
    e.preventDefault()
    e.stopPropagation()
    dispatch(action)
    if (action.type === "select" || action.type === "delete") {
      ;(e.currentTarget as HTMLElement).blur()
    }
  }

  return (
    <div
      ref={layerRef}
      data-field-layer
      className={cn(
        "on-paper absolute inset-0 touch-none select-none",
        placing ? "pointer-events-auto cursor-crosshair" : "pointer-events-none",
      )}
      onPointerDownCapture={onPointerDown}
      onPointerMoveCapture={onPointerMove}
      onPointerUpCapture={onPointerUp}
      onPointerCancelCapture={onPointerUp}
      onMouseDownCapture={(e) => e.stopPropagation()}
    >
      {fields.map((f) => {
        const r = recipients.get(f.recipientId)
        const selected = state.selected === f.key
        const label = `${FIELD_LABELS[f.type]}${r ? ` for ${r.name}` : ""}`
        return (
          <button
            type="button"
            key={f.key}
            data-field-key={f.key}
            aria-label={label}
            aria-pressed={selected}
            title={label}
            onKeyDown={onKeyDown}
            style={{ ...rectStyle(displayedToLocalRect(f, rot)), containerType: "size" }}
            className={cn(
              "enter-pop pointer-events-auto absolute cursor-move overflow-hidden rounded-sm border-2 text-left outline-none",
              RECIPIENT_COLORS[(r?.colorIndex ?? 0) % RECIPIENT_COLORS.length],
              selected && "ring-2 ring-ring ring-offset-1",
            )}
          >
            {/* Upright in the displayed frame, so the handle sits at the displayed bottom-right. */}
            <span
              style={uprightContentStyle(rot)}
              className="flex items-center justify-center px-1"
            >
              <span className={cn("pointer-events-none", FIELD_LABEL_CLASS)}>
                {f.label || FIELD_LABELS[f.type]}
                {f.required ? " *" : ""}
              </span>
              {selected && (
                <span
                  data-handle="resize"
                  aria-hidden
                  className="absolute right-0 bottom-0 size-2.5 cursor-se-resize rounded-tl-sm border-foreground border-t border-l bg-background"
                />
              )}
            </span>
          </button>
        )
      })}
      {preview && (
        <div
          aria-hidden
          style={rectStyle(displayedToLocalRect(preview, rot))}
          className="pointer-events-none absolute rounded-sm border-2 border-ring border-dashed bg-ring/10"
        />
      )}
    </div>
  )
}
