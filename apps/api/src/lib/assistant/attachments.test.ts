import { describe, expect, test } from "bun:test"
import type { UIMessage } from "ai"
import {
  AttachmentError,
  assertAttachments,
  attachedStatements,
  forModel,
  forStorage,
  MAX_ATTACHMENT_CHARS,
} from "./attachments"

const textUrl = (text: string) =>
  `data:text/plain;charset=utf-8;base64,${Buffer.from(text).toString("base64")}`
const PNG = "data:image/png;base64,iVBORw0KGgo="

const user = (...parts: UIMessage["parts"]): UIMessage => ({ id: "u1", role: "user", parts })
const doc = (text: string, filename = "terms.pdf") =>
  ({ type: "file", mediaType: "text/plain", url: textUrl(text), filename }) as const
const image = { type: "file", mediaType: "image/png", url: PNG, filename: "id.png" } as const

describe("chat attachments", () => {
  test("a document's text is evidence and reaches the model as a quoted file", () => {
    const messages = [user({ type: "text", text: "Use this" }, doc("Client: Acme Ltd"))]
    expect(attachedStatements(messages)).toEqual(["Client: Acme Ltd"])
    expect(forModel(messages)[0]?.parts[1]).toEqual({
      type: "text",
      text: '<attached_file name="terms.pdf">\nClient: Acme Ltd\n</attached_file>',
    })
  })

  test("an image is for reference: not evidence, sent to the model, never stored", () => {
    const messages = [user({ type: "text", text: "My ID" }, image)]
    expect(attachedStatements(messages)).toEqual([])
    expect(forModel(messages)[0]?.parts[1]).toEqual(image)
    expect(forStorage(messages)[0]?.parts[1]).toEqual({
      type: "text",
      text: "[Image “id.png” attached, not kept]",
    })
  })

  test("a document's text is cut at the limit", () => {
    const long = "x".repeat(MAX_ATTACHMENT_CHARS + 10)
    expect(attachedStatements([user(doc(long))])[0]?.length).toBe(MAX_ATTACHMENT_CHARS)
  })

  test("refuses remote URLs, other types, too many files and files from the assistant", () => {
    const remote = { type: "file", mediaType: "image/png", url: "https://x.test/a.png" } as const
    const exe = { type: "file", mediaType: "application/x-msdownload", url: "data:,MZ" } as const
    expect(() => assertAttachments([user(remote)])).toThrow(AttachmentError)
    expect(() => assertAttachments([user(exe)])).toThrow(AttachmentError)
    expect(() => assertAttachments([user(doc("a"), doc("b"), doc("c"), doc("d"))])).toThrow(
      AttachmentError,
    )
    expect(() => assertAttachments([{ id: "a1", role: "assistant", parts: [doc("x")] }])).toThrow(
      AttachmentError,
    )
    expect(() => assertAttachments([user(doc("ok"), image)])).not.toThrow()
  })
})
