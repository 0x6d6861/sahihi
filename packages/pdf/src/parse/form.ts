import type { FormWidget, FormWidgetKind } from "@sahihi/core"
import {
  AnnotationFlags,
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  type PDFField,
  PDFSignature,
  PDFTextField,
} from "pdf-lib"

const kindOf = (field: PDFField): FormWidgetKind =>
  field instanceof PDFSignature
    ? "signature"
    : field instanceof PDFTextField
      ? "text"
      : field instanceof PDFCheckBox
        ? "checkbox"
        : "other"

/**
 * Every AcroForm widget in the PDF with its page and /Rect (PDF user space). Pure parsing: turn
 * the result into field suggestions with `suggestFieldsFromForm` from `@sahihi/core`.
 * Hidden widgets are left out. A PDF without a form, or with a form pdf-lib can't read, gives [].
 */
export async function readFormWidgets(bytes: Uint8Array): Promise<FormWidget[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  // getForm() would otherwise create an empty AcroForm.
  if (!doc.catalog.getAcroForm()) return []

  // Widget → page through each page's /Annots. Many PDFs omit the widget's own /P entry.
  const pageOf = new Map<PDFDict, number>()
  doc.getPages().forEach((page, i) => {
    const annots = page.node.Annots()
    for (let j = 0; j < (annots?.size() ?? 0); j++) {
      const dict = annots?.lookup(j)
      if (dict instanceof PDFDict) pageOf.set(dict, i + 1)
    }
  })

  let fields: PDFField[]
  try {
    fields = doc.getForm().getFields()
  } catch {
    // Malformed forms (broken field trees) can't be read; the PDF itself is still usable.
    return []
  }

  const widgets: FormWidget[] = []
  for (const field of fields) {
    const kind = kindOf(field)
    const name = field.getName()
    for (const w of field.acroField.getWidgets()) {
      const page = pageOf.get(w.dict)
      if (!page || w.hasFlag(AnnotationFlags.Hidden) || w.hasFlag(AnnotationFlags.NoView)) continue
      widgets.push({ kind, name, page, rect: w.getRectangle() })
    }
  }
  return widgets
}
