import { describe, expect, test } from "bun:test"
import { findStarter } from "@sahihi/core"
import { blankKey, fromEditorDoc, toEditorDoc } from "./generator-editor"

const nda = () => {
  const data = findStarter("mutual-nda")?.build()
  if (!data) throw new Error("missing starter")
  return data
}

describe("editor conversion", () => {
  test("round-trips a starter unchanged", () => {
    const { content } = nda()
    expect(fromEditorDoc(toEditorDoc(content))).toEqual(content)
  })

  test("signature blocks become one atomic node with their items", () => {
    const editor = toEditorDoc(nda().content)
    const signatures = editor.content?.find((s) => s.attrs?.id === "signatures")
    const block = signatures?.content?.find((b) => b.type === "signatureBlock")
    expect(block?.content).toBeUndefined()
    expect(block?.attrs?.roleKey).toBe("party_a")
    expect(Array.isArray(block?.attrs?.items)).toBe(true)
  })

  test("drops editor-only attributes and refuses what the model doesn't allow", () => {
    const editor = toEditorDoc(nda().content)
    const first = editor.content?.[0]?.content?.[0]
    if (first) first.attrs = { textAlign: "left" }
    expect(JSON.stringify(fromEditorDoc(editor))).not.toContain("textAlign")

    const heading = toEditorDoc(nda().content)
    heading.content?.[0]?.content?.push({ type: "heading", attrs: { level: 1 }, content: [] })
    expect(() => fromEditorDoc(heading)).toThrow()
  })
})

test("blankKey makes unique snake-case keys", () => {
  expect(blankKey("Monthly fee (KES)", [])).toBe("monthly_fee_kes")
  expect(blankKey("Monthly fee", ["monthly_fee"])).toBe("monthly_fee_2")
  expect(blankKey("Café", [])).toBe("cafe")
  expect(blankKey("2nd party", [])).toBe("nd_party")
  expect(blankKey("!!!", [])).toBe("blank")
})
