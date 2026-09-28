# Coordinates

Getting coordinates wrong makes signatures land in the wrong place, which is the most common
e-signature bug. Every conversion goes through `packages/core/src/coordinates.ts`, which is
unit-tested for all four rotations.

## Two coordinate systems

| | **Normalized** (what we store) | **PDF user space** (what pdf-lib draws in) |
|---|---|---|
| Unit | fraction of the page, 0–1 | points (1/72 in) |
| Origin | **top-left** of the page **as displayed** | **bottom-left** of the **unrotated** crop box |
| y axis | grows **down** | grows **up** |
| Rotation | already applied (what the user sees) | `/Rotate` applied by viewers at render time |
| Where | `Field.x/y/width/height`, API, editor state | `stampFields` only |

The normalized form is independent of zoom level, device, and whether the viewer uses CSS pixels or
canvas pixels. The editor never needs to know the page size in points.

## Page metadata

On upload, `inspectPdf` stores `Document.pages: PageBox[]`, with one entry per page:

```ts
{ x, y, width, height, rotation }   // crop box in PDF units, rotation ∈ {0,90,180,270}
```

`x`/`y` are usually 0 but aren't always (cropped scans), so conversions add them back.
`displayedSize(page)` swaps width and height for 90° and 270°.

## UI → normalized (editor)

`apps/web/lib/field-geometry.ts`:

```ts
const rect = pageElement.getBoundingClientRect()          // from PDFViewer renderPageOverlay
const p = toNormalizedPoint(e.clientX, e.clientY, rect)  // 0–1, top-left
rectFromDrag(start, p)   // drag to draw
rectAtPoint(p, type)     // click to place with DEFAULT_FIELD_SIZE
moveRect / resizeRect    // always clampRect → stays on the page
rectStyle(r)             // → { left: "x%", top: "y%", width, height } for absolute positioning
```

Render fields as absolutely positioned children of the page overlay, using `rectStyle`. Percentages
mean zoom needs no extra maths.

## Overlay frame (Extend viewer and editor)

`renderPageOverlay` content lives inside EmbedPDF's rotate wrapper. The wrapper's **local** frame is
the page before its own `/Rotate`; CSS then turns it (by `/Rotate` plus any view rotation). Stored
rects are in the **displayed** frame, so overlays convert:

```ts
rectStyle(displayedToLocalRect(r, rotation))   // where to draw a stored field
localToDisplayedPoint(p, rotation)             // pointer (layer-local, via offsetX/Y) → stored frame
uprightContentStyle(rotation)                  // keep labels and signatures upright inside the box
```

`rotation` is the page's intrinsic `/Rotate` (`Document.pages[i].rotation`). A view rotation from
the toolbar needs no maths, because the whole wrapper turns. `field-geometry.test.ts` checks the
mapping for all four rotations against the same independent reference as the stamping tests. Before
this, fields on `/Rotate 90` and `/Rotate 270` pages were drawn and stored in the wrong frame.

## Normalized → PDF (stamping)

```ts
toPdfRect(r, page)       // axis-aligned rect in PDF user space (for bounds, debugging)
toPdfPlacement(r, page)  // { x, y, width, height, rotate } → pass to pdf-lib drawImage/drawText
containIn(box, aspect)   // fit a signature PNG inside the field (object-fit: contain)
```

`toPdfPlacement` returns the anchor and rotation so content appears **upright to the reader** even
on rotated pages. pdf-lib rotates counter-clockwise around `(x, y)`.

## Rules

1. Store and transmit **only** normalized rects. Validate them with `NormalizedRectSchema`, which
   requires the field to lie within the page.
2. `page` is **1-based** everywhere (API, DB, UI). pdf-lib's `getPages()` is 0-based, so use
   `pages[field.page - 1]`.
3. Never compute coordinates from PDF.js or EmbedPDF internal scale factors. Use the page element's
   bounding rect.
4. When changing `coordinates.ts`, extend `coordinates.test.ts` for **every** rotation and check that
   the round trip `fromPdfRect(toPdfRect(r)) ≈ r` holds.
5. Test documents live in `fixtures/` (see its README): rotated 90° and 270°, non-zero crop box
   origins (one also rotated), mixed page sizes (A4, Letter, landscape, 180°), and a scanned
   image-only PDF. They're generated deterministically by `packages/pdf/src/fixtures.ts` (`bun run
   fixtures`). `fixtures.test.ts` checks every page by stamping and asserting on the content-stream
   `cm` matrix with an independent display transform. A change to `coordinates.ts` that moves a
   field fails it.
