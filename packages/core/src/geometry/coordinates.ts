/**
 * Coordinate conversions between the UI and PDF user space.
 * READ docs/coordinates.md BEFORE CHANGING ANYTHING HERE.
 *
 * Storage format (Field.x/y/width/height) — NormalizedRect:
 *   - fractions 0–1 of the page AS DISPLAYED (page /Rotate already applied)
 *   - origin TOP-LEFT, y grows downward
 *
 * PDF user space:
 *   - points (1/72 in), origin BOTTOM-LEFT of the UNROTATED crop box, y grows upward
 */

export type Rotation = 0 | 90 | 180 | 270

export interface NormalizedRect {
  x: number
  y: number
  width: number
  height: number
}

/** A page's crop box in unrotated PDF user space plus its /Rotate value. */
export interface PageBox {
  x: number
  y: number
  width: number
  height: number
  rotation: Rotation
}

export interface PdfRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Where to draw content so it appears upright in viewers.
 * Pass directly to pdf-lib: drawImage(img, { x, y, width, height, rotate: degrees(rotate) })
 * `width`/`height` are the content's size AS DISPLAYED; pdf-lib rotates
 * counter-clockwise around (x, y).
 */
export interface PdfPlacement {
  x: number
  y: number
  width: number
  height: number
  rotate: Rotation
}

export function normalizeRotation(deg: number): Rotation {
  const r = (((Math.round(deg / 90) * 90) % 360) + 360) % 360
  return r as Rotation
}

/** Size of the page as the viewer displays it. */
export function displayedSize(page: PageBox): { width: number; height: number } {
  return page.rotation === 90 || page.rotation === 270
    ? { width: page.height, height: page.width }
    : { width: page.width, height: page.height }
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** Clamp a rect so it lies fully on the page. Width/height keep a small minimum. */
export function clampRect(r: NormalizedRect, min = 0.005): NormalizedRect {
  const width = Math.min(1, Math.max(min, r.width))
  const height = Math.min(1, Math.max(min, r.height))
  return {
    x: Math.min(clamp01(r.x), 1 - width),
    y: Math.min(clamp01(r.y), 1 - height),
    width,
    height,
  }
}

export function isValidRect(r: NormalizedRect): boolean {
  return (
    [r.x, r.y, r.width, r.height].every(Number.isFinite) &&
    r.x >= 0 &&
    r.y >= 0 &&
    r.width > 0 &&
    r.height > 0 &&
    r.x + r.width <= 1 + 1e-9 &&
    r.y + r.height <= 1 + 1e-9
  )
}

/** Convert a normalized (displayed, top-left) rect to an axis-aligned rect in PDF user space. */
export function toPdfRect(r: NormalizedRect, page: PageBox): PdfRect {
  const W = page.width
  const H = page.height
  let rect: PdfRect
  switch (page.rotation) {
    case 0:
      rect = { x: r.x * W, y: (1 - r.y - r.height) * H, width: r.width * W, height: r.height * H }
      break
    case 90:
      rect = { x: r.y * W, y: r.x * H, width: r.height * W, height: r.width * H }
      break
    case 180:
      rect = { x: (1 - r.x - r.width) * W, y: r.y * H, width: r.width * W, height: r.height * H }
      break
    case 270:
      rect = {
        x: (1 - r.y - r.height) * W,
        y: (1 - r.x - r.width) * H,
        width: r.height * W,
        height: r.width * H,
      }
      break
  }
  return { ...rect, x: rect.x + page.x, y: rect.y + page.y }
}

/** Inverse of toPdfRect. */
export function fromPdfRect(p: PdfRect, page: PageBox): NormalizedRect {
  const W = page.width
  const H = page.height
  const x = p.x - page.x
  const y = p.y - page.y
  switch (page.rotation) {
    case 0:
      return { x: x / W, y: 1 - (y + p.height) / H, width: p.width / W, height: p.height / H }
    case 90:
      return { x: y / H, y: x / W, width: p.height / H, height: p.width / W }
    case 180:
      return { x: 1 - (x + p.width) / W, y: y / H, width: p.width / W, height: p.height / H }
    case 270:
      return {
        x: 1 - (y + p.height) / H,
        y: 1 - (x + p.width) / W,
        width: p.height / H,
        height: p.width / W,
      }
  }
}

/** Placement for drawing upright content (image/text) into a normalized field. */
export function toPdfPlacement(r: NormalizedRect, page: PageBox): PdfPlacement {
  const rect = toPdfRect(r, page)
  const shown = displayedSize(page)
  const width = r.width * shown.width
  const height = r.height * shown.height
  switch (page.rotation) {
    case 0:
      return { x: rect.x, y: rect.y, width, height, rotate: 0 }
    case 90:
      return { x: rect.x + rect.width, y: rect.y, width, height, rotate: 90 }
    case 180:
      return { x: rect.x + rect.width, y: rect.y + rect.height, width, height, rotate: 180 }
    case 270:
      return { x: rect.x, y: rect.y + rect.height, width, height, rotate: 270 }
  }
}

/** Fit an image of the given aspect ratio inside a box, centred (object-fit: contain). */
export function containIn(
  box: { width: number; height: number },
  aspect: number,
): { offsetX: number; offsetY: number; width: number; height: number } {
  let width = box.width
  let height = width / aspect
  if (height > box.height) {
    height = box.height
    width = height * aspect
  }
  return { offsetX: (box.width - width) / 2, offsetY: (box.height - height) / 2, width, height }
}
