import { clampRect, type NormalizedRect } from "@sahihi/core"

/**
 * Pure helpers for the field-placement editor. The PDF viewer's page overlay
 * gives us a page element; everything is converted to NORMALIZED coordinates
 * (0–1, top-left origin, relative to the page as displayed) before it touches
 * state or the API. See docs/coordinates.md.
 */

export interface Point {
  x: number
  y: number
}

/** Pointer position → normalized point on the page element. */
export function toNormalizedPoint(
  clientX: number,
  clientY: number,
  pageRect: DOMRectReadOnly | { left: number; top: number; width: number; height: number },
): Point {
  return {
    x: Math.min(1, Math.max(0, (clientX - pageRect.left) / pageRect.width)),
    y: Math.min(1, Math.max(0, (clientY - pageRect.top) / pageRect.height)),
  }
}

/** Rect spanned by a drag, clamped onto the page. */
export function rectFromDrag(a: Point, b: Point): NormalizedRect {
  return clampRect({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  })
}

/** Default field sizes as a fraction of an A4-ish page, used on click-to-place. */
export const DEFAULT_FIELD_SIZE: Record<string, { width: number; height: number }> = {
  SIGNATURE: { width: 0.3, height: 0.06 },
  INITIALS: { width: 0.1, height: 0.05 },
  DATE_SIGNED: { width: 0.18, height: 0.03 },
  NAME: { width: 0.25, height: 0.03 },
  EMAIL: { width: 0.3, height: 0.03 },
  TEXT: { width: 0.25, height: 0.03 },
  CHECKBOX: { width: 0.03, height: 0.022 },
}

/** Rect centred on a click point with the field type's default size. */
export function rectAtPoint(p: Point, type: string): NormalizedRect {
  const size = DEFAULT_FIELD_SIZE[type] ?? { width: 0.2, height: 0.04 }
  return clampRect({ x: p.x - size.width / 2, y: p.y - size.height / 2, ...size })
}

/** Move a rect by a normalized delta, keeping it on the page. */
export function moveRect(r: NormalizedRect, dx: number, dy: number): NormalizedRect {
  return clampRect({ ...r, x: r.x + dx, y: r.y + dy })
}

/** Resize from the bottom-right handle. */
export function resizeRect(r: NormalizedRect, dw: number, dh: number): NormalizedRect {
  return clampRect({ ...r, width: r.width + dw, height: r.height + dh })
}

/** CSS for absolutely positioning a field inside the page overlay. */
export function rectStyle(r: NormalizedRect) {
  return {
    left: `${r.x * 100}%`,
    top: `${r.y * 100}%`,
    width: `${r.width * 100}%`,
    height: `${r.height * 100}%`,
  } as const
}

/**
 * EmbedPDF renders page overlays inside its rotate wrapper, whose LOCAL frame is the page before its
 * own /Rotate is applied. We store rects in the DISPLAYED frame (docs/coordinates.md), so overlays
 * convert with these. `rotation` is the page's intrinsic /Rotate (PageBox.rotation); any extra view
 * rotation is CSS on the same wrapper and needs no maths.
 */
export type PageRotation = 0 | 90 | 180 | 270

/** Displayed-frame rect → overlay-local rect. */
export function displayedToLocalRect(r: NormalizedRect, rotation: PageRotation): NormalizedRect {
  switch (rotation) {
    case 0:
      return r
    case 90:
      return { x: r.y, y: 1 - r.x - r.width, width: r.height, height: r.width }
    case 180:
      return { x: 1 - r.x - r.width, y: 1 - r.y - r.height, width: r.width, height: r.height }
    case 270:
      return { x: 1 - r.y - r.height, y: r.x, width: r.height, height: r.width }
  }
}

/** Overlay-local point (e.g. from the pointer) → displayed-frame point. */
export function localToDisplayedPoint(p: Point, rotation: PageRotation): Point {
  switch (rotation) {
    case 0:
      return p
    case 90:
      return { x: 1 - p.y, y: p.x }
    case 180:
      return { x: 1 - p.x, y: 1 - p.y }
    case 270:
      return { x: p.y, y: 1 - p.x }
  }
}

/**
 * Style for a field's inner content so it reads upright in the displayed frame: rotate back by the
 * page's /Rotate and swap width/height for 90/270, using the field box as a size container.
 */
export function uprightContentStyle(rotation: PageRotation) {
  const quarter = rotation === 90 || rotation === 270
  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: quarter ? "100cqh" : "100cqw",
    height: quarter ? "100cqw" : "100cqh",
    transform: `translate(-50%, -50%) rotate(${-rotation}deg)`,
  } as const
}
