import type { UIMessage } from "ai"

/**
 * Files attached in the drafting chat (docs/ai-documents.md → Attachments, ADR 0050). They reach a
 * message as AI SDK `file` parts:
 *
 * - a document's text: a PDF, Word or text file is read on the server
 *   (`POST /generated-documents/:id/attachments`) and the browser attaches the extracted text as
 *   `text/plain`. The assistant reads it as a quoted file, and what it says counts as something
 *   the person stated (their own file), like their messages;
 * - an image (a photo, a scan): sent to the model as is, for reference only: values read from an
 *   image aren't evidence, so the assistant confirms them in the chat before using them.
 *
 * Only text is kept: the conversation is saved with images replaced by a note.
 */

export const MAX_ATTACHMENTS_PER_MESSAGE = 3
/** A document's text is cut at this length (the conversation goes into every turn). */
export const MAX_ATTACHMENT_CHARS = 20_000
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const ATTACHMENT_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const

type Part = UIMessage["parts"][number]
type FilePart = Extract<Part, { type: "file" }>

export class AttachmentError extends Error {}

/** A data URL's bytes, or null when it isn't one (remote URLs are refused). */
function dataUrlBytes(url: string): { mediaType: string; bytes: Uint8Array } | null {
  const m = /^data:([^;,]*)((?:;[^;,]*)*?)(;base64)?,(.*)$/s.exec(url)
  if (!m) return null
  const [, mediaType = "", , base64, payload = ""] = m
  try {
    const bytes = base64
      ? Uint8Array.from(atob(payload), (ch) => ch.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(payload))
    return { mediaType: mediaType.toLowerCase(), bytes }
  } catch {
    return null
  }
}

/** The text of a `text/plain` attachment, or null for other parts. */
export function attachmentText(part: Part): string | null {
  if (part.type !== "file" || !part.mediaType.startsWith("text/plain")) return null
  const data = dataUrlBytes(part.url)
  return data ? new TextDecoder().decode(data.bytes).slice(0, MAX_ATTACHMENT_CHARS) : null
}

const isImage = (part: FilePart) => part.mediaType.startsWith("image/")

/**
 * Throws `AttachmentError` for a file part the assistant can't take: not a data URL, a type other
 * than extracted text or an allowed image, an image over 5 MB, too much text, or more than three in
 * one message. Assistant messages never carry files.
 */
export function assertAttachments(messages: UIMessage[]): void {
  for (const m of messages) {
    const files = m.parts.filter((p): p is FilePart => p.type === "file")
    if (files.length === 0) continue
    if (m.role !== "user") throw new AttachmentError("Only the person's messages can carry files")
    if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      throw new AttachmentError(`Attach at most ${MAX_ATTACHMENTS_PER_MESSAGE} files to a message`)
    }
    for (const part of files) {
      const data = dataUrlBytes(part.url)
      if (!data) throw new AttachmentError("Attachments must be sent with the message")
      if (part.mediaType.startsWith("text/plain")) {
        if (data.bytes.byteLength > MAX_ATTACHMENT_CHARS * 4) {
          throw new AttachmentError("An attached document's text is too long")
        }
      } else if ((ATTACHMENT_IMAGE_TYPES as readonly string[]).includes(part.mediaType)) {
        if (data.bytes.byteLength > MAX_IMAGE_BYTES) {
          throw new AttachmentError("Images can be at most 5 MB")
        }
      } else {
        throw new AttachmentError("Attach a PDF, Word or text file, or an image")
      }
    }
  }
}

/** Text the person attached: evidence for blanks and proposals, like what they typed. */
export function attachedStatements(messages: UIMessage[]): string[] {
  return messages
    .filter((m) => m.role === "user")
    .flatMap((m) => m.parts.map(attachmentText))
    .filter((t): t is string => Boolean(t))
}

/**
 * The conversation as the model reads it: a document's text becomes a quoted text part (models
 * don't all take `text/plain` files), images stay files.
 */
export function forModel(messages: UIMessage[]): UIMessage[] {
  return messages.map((m) => {
    if (m.role !== "user" || !m.parts.some((p) => p.type === "file")) return m
    return {
      ...m,
      parts: m.parts.map((p): Part => {
        const text = attachmentText(p)
        if (text === null || p.type !== "file") return p
        return {
          type: "text",
          text: `<attached_file name=${JSON.stringify(p.filename ?? "document")}>\n${text}\n</attached_file>`,
        }
      }),
    }
  })
}

/** The conversation as it's saved: images dropped for a note, so only text is kept. */
export function forStorage(messages: UIMessage[]): UIMessage[] {
  return messages.map((m) => {
    if (!m.parts.some((p) => p.type === "file" && isImage(p))) return m
    return {
      ...m,
      parts: m.parts.map(
        (p): Part =>
          p.type === "file" && isImage(p)
            ? { type: "text", text: `[Image “${p.filename ?? "image"}” attached, not kept]` }
            : p,
      ),
    }
  })
}
