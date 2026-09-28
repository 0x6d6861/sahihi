import {
  containIn,
  displayedSize,
  type FieldType,
  type NormalizedRect,
  normalizeRotation,
  type PageBox,
  toPdfPlacement,
} from "@sahihi/core"
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib"
import { fitFontSize, sanitizeForFont } from "./text"

export type StampValue =
  | { kind: "image"; png: Uint8Array }
  | { kind: "text"; text: string }
  | { kind: "checkbox"; checked: boolean }

export interface StampField {
  /** 1-based */
  page: number
  rect: NormalizedRect
  type: FieldType
  value: StampValue
}

export interface StampOptions {
  /** Written into the PDF metadata. */
  title?: string
  envelopeId?: string
}

/**
 * Burn completed field values into the ORIGINAL PDF and flatten any AcroForm.
 * Server-side only — the client never produces final PDF bytes.
 * See docs/pdf-pipeline.md.
 */
export async function stampFields(
  original: Uint8Array,
  fields: StampField[],
  opts: StampOptions = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(original)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pages = doc.getPages()
  const imageCache = new Map<Uint8Array, Awaited<ReturnType<typeof doc.embedPng>>>()

  for (const field of fields) {
    const page = pages[field.page - 1]
    if (!page) throw new Error(`Field references page ${field.page}, document has ${pages.length}`)
    const crop = page.getCropBox()
    const box: PageBox = { ...crop, rotation: normalizeRotation(page.getRotation().angle) }
    const shown = displayedSize(box)

    switch (field.value.kind) {
      case "image": {
        let img = imageCache.get(field.value.png)
        if (!img) {
          img = await doc.embedPng(field.value.png)
          imageCache.set(field.value.png, img)
        }
        // object-fit: contain, computed in the displayed frame then mapped
        const fieldPx = {
          width: field.rect.width * shown.width,
          height: field.rect.height * shown.height,
        }
        const fit = containIn(fieldPx, img.width / img.height)
        const inner: NormalizedRect = {
          x: field.rect.x + fit.offsetX / shown.width,
          y: field.rect.y + fit.offsetY / shown.height,
          width: fit.width / shown.width,
          height: fit.height / shown.height,
        }
        const pl = toPdfPlacement(inner, box)
        page.drawImage(img, {
          x: pl.x,
          y: pl.y,
          width: pl.width,
          height: pl.height,
          rotate: degrees(pl.rotate),
        })
        break
      }
      case "text": {
        const text = sanitizeForFont(field.value.text, font)
        if (!text) break
        const pl = toPdfPlacement(field.rect, box)
        const size = fitFontSize(text, font, pl.width, pl.height)
        // Vertically centre the baseline inside the field (in the displayed frame)
        const inset = (pl.height - size) / 2 + size * 0.2
        const lead = Math.min(2, pl.width * 0.02)
        const t = (pl.rotate * Math.PI) / 180
        page.drawText(text, {
          x: pl.x + lead * Math.cos(t) - inset * Math.sin(t),
          y: pl.y + lead * Math.sin(t) + inset * Math.cos(t),
          size,
          font,
          color: rgb(0.05, 0.05, 0.2),
          rotate: degrees(pl.rotate),
        })
        break
      }
      case "checkbox": {
        if (!field.value.checked) break
        const pl = toPdfPlacement(field.rect, box)
        const size = fitFontSize("X", font, pl.width, pl.height, 18)
        const t = (pl.rotate * Math.PI) / 180
        const dx = (pl.width - font.widthOfTextAtSize("X", size)) / 2
        const dy = (pl.height - size) / 2 + size * 0.2
        page.drawText("X", {
          x: pl.x + dx * Math.cos(t) - dy * Math.sin(t),
          y: pl.y + dx * Math.sin(t) + dy * Math.cos(t),
          size,
          font,
          color: rgb(0.05, 0.05, 0.2),
          rotate: degrees(pl.rotate),
        })
        break
      }
    }
  }

  // Prevent post-signing edits to interactive fields
  try {
    doc.getForm().flatten()
  } catch {
    // Some malformed forms can't be flattened; the stamped content is still correct.
  }

  if (opts.title) doc.setTitle(opts.title)
  if (opts.envelopeId) doc.setSubject(`Sahihi envelope ${opts.envelopeId}`)
  doc.setProducer("Sahihi")
  doc.setModificationDate(new Date())

  return doc.save({ useObjectStreams: true })
}

/** Decode a `data:image/png;base64,…` URL (as submitted by the signer UI). */
export function pngFromDataUrl(dataUrl: string): Uint8Array {
  const prefix = "data:image/png;base64,"
  if (!dataUrl.startsWith(prefix)) throw new Error("Expected a PNG data URL")
  const bytes = Uint8Array.from(atob(dataUrl.slice(prefix.length)), (c) => c.charCodeAt(0))
  // PNG magic number
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47)
    throw new Error("Invalid PNG")
  return bytes
}
