import { describe, expect, test } from "bun:test"
import { AnnotationFlags, degrees, PDFDocument, PDFName, PDFString } from "pdf-lib"
import { readFormWidgets } from "./form"

async function formPdf() {
  const doc = await PDFDocument.create()
  const p1 = doc.addPage([612, 792])
  const p2 = doc.addPage([612, 792])
  p2.setRotation(degrees(90))
  const form = doc.getForm()
  form.createTextField("Buyer Name").addToPage(p1, { x: 50, y: 100, width: 200, height: 20 })
  form.createCheckBox("Agree").addToPage(p2, { x: 60, y: 60, width: 12, height: 12 })
  form.createRadioGroup("Plan").addOptionToPage("a", p1, { x: 300, y: 300, width: 12, height: 12 })
  const hidden = form.createTextField("Hidden")
  hidden.addToPage(p1, { x: 10, y: 10, width: 50, height: 20 })
  hidden.acroField.getWidgets()[0]?.setFlagTo(AnnotationFlags.Hidden, true)

  // pdf-lib can't create signature fields, so build one by hand: a merged field + widget dict.
  const sig = doc.context.obj({
    Type: "Annot",
    Subtype: "Widget",
    FT: "Sig",
    Rect: [100, 600, 300, 650],
    F: 4,
  })
  sig.set(PDFName.of("T"), PDFString.of("Seller Signature"))
  const ref = doc.context.register(sig)
  p1.node.addAnnot(ref)
  form.acroForm.addField(ref)
  return doc.save()
}

describe("readFormWidgets", () => {
  test("lists visible widgets with kind, name, page and rect", async () => {
    const widgets = await readFormWidgets(await formPdf())
    const byName = Object.fromEntries(widgets.map((w) => [w.name, w]))
    expect(Object.keys(byName).sort()).toEqual(["Agree", "Buyer Name", "Plan", "Seller Signature"])
    expect(byName["Buyer Name"]).toEqual({
      kind: "text",
      name: "Buyer Name",
      page: 1,
      // pdf-lib grows the widget by half its 1pt border on each side
      rect: { x: 49.5, y: 99.5, width: 201, height: 21 },
    })
    expect(byName.Agree?.kind).toBe("checkbox")
    expect(byName.Agree?.page).toBe(2)
    expect(byName.Plan?.kind).toBe("other")
    expect(byName["Seller Signature"]).toMatchObject({
      kind: "signature",
      page: 1,
      rect: { x: 100, y: 600, width: 200, height: 50 },
    })
  })

  test("a PDF without a form has no widgets", async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    expect(await readFormWidgets(await doc.save())).toEqual([])
  })
})
