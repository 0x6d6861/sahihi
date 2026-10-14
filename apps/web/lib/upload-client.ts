"use client"

import { attachmentContentType, MAX_UPLOAD_BYTES } from "@sahihi/core"
import { api } from "./api"
import { prepareUpload, type UploadStage } from "./upload"

/** PUT to the presigned S3 URL. XHR rather than fetch, because fetch has no upload progress. */
function putWithProgress(
  url: string,
  file: Blob,
  onProgress: (fraction: number) => void,
  contentType = "application/pdf",
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    xhr.setRequestHeader("Content-Type", contentType)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed"))
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection."))
    xhr.send(file)
  })
}

export class UploadRejectedError extends Error {}

/** How long the upload waits for a Word file's conversion before leaving it to the worker. */
const CONVERSION_WAIT_MS = 3 * 60_000
const CONVERSION_POLL_MS = 1_500

interface UploadedDocument {
  id: string
  name: string
  status: "UPLOADING" | "CONVERTING" | "READY" | "FAILED"
  failureReason: string | null
}

/**
 * The upload flow (docs/pdf-pipeline.md → Upload): create → PUT to the presigned URL → complete.
 * The server validates and hashes a PDF on `complete`; a Word file goes CONVERTING and, with
 * `waitForConversion` (the default), this waits until the worker has made it a READY PDF (ADR
 * 0052). Returns the new document; `converting` when it stopped waiting first. Throws
 * `UploadRejectedError` when the file fails the client pre-check (nothing is sent), and an error
 * with the reason when the conversion fails.
 */
export async function uploadDocument(
  file: File,
  opts: {
    sourceDocumentId?: string
    /** Folder the document lands in (ADR 0022); omitted = workspace root. */
    folderId?: string
    /** Refuse Word files (flows that need the PDF at once). */
    pdfOnly?: boolean
    /** Wait for a Word file's conversion (default true); a batch upload doesn't. */
    waitForConversion?: boolean
    onStage?: (stage: UploadStage, fraction?: number) => void
  } = {},
): Promise<{ id: string; name: string; converting: boolean }> {
  const prepared = prepareUpload(file, { pdfOnly: opts.pdfOnly })
  if (!prepared.ok) throw new UploadRejectedError(prepared.message)
  const input = {
    ...prepared.input,
    ...(opts.sourceDocumentId && { sourceDocumentId: opts.sourceDocumentId }),
    ...(opts.folderId && { folderId: opts.folderId }),
  }

  opts.onStage?.("creating")
  const { document, uploadUrl } = await api<{ document: UploadedDocument; uploadUrl: string }>(
    "/documents/uploads",
    { method: "POST", json: input },
  )
  opts.onStage?.("uploading", 0)
  await putWithProgress(uploadUrl, file, (f) => opts.onStage?.("uploading", f), input.contentType)
  opts.onStage?.("checking")
  let done = (
    await api<{ document: UploadedDocument }>(`/documents/${document.id}/complete`, {
      method: "POST",
    })
  ).document
  if (done.status === "CONVERTING" && opts.waitForConversion !== false) {
    opts.onStage?.("converting")
    done = await waitForConversion(document.id)
  }
  if (done.status === "FAILED") throw new Error(done.failureReason ?? "The file couldn't be used.")
  opts.onStage?.("done")
  return { id: done.id, name: done.name, converting: done.status === "CONVERTING" }
}

/** Polls the document until the worker has converted it (or given up), up to a few minutes. */
async function waitForConversion(id: string): Promise<UploadedDocument> {
  const until = Date.now() + CONVERSION_WAIT_MS
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, CONVERSION_POLL_MS))
    const { document } = await api<{ document: UploadedDocument }>(`/documents/${id}`)
    if (document.status !== "CONVERTING" || Date.now() > until) return document
  }
}

/**
 * A supporting file for a draft envelope (ADR 0037): create → PUT → complete, like a document.
 * The type comes from the file (or its extension); anything outside the allowlist, or over 25 MB,
 * is refused before anything is sent.
 */
export async function uploadAttachment(
  envelopeId: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<{ id: string; name: string }> {
  const contentType = attachmentContentType(file.name, file.type)
  if (!contentType) {
    throw new UploadRejectedError(
      `${file.name}: this file type can't be attached. Use a PDF, image, Office file, CSV or text file.`,
    )
  }
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new UploadRejectedError(`${file.name}: files must be 1 byte to 25 MB.`)
  }
  const name = file.name.trim().slice(0, 200) || "file"
  const { attachment, uploadUrl } = await api<{
    attachment: { id: string }
    uploadUrl: string
  }>(`/envelopes/${envelopeId}/attachments/uploads`, {
    method: "POST",
    json: { name, sizeBytes: file.size, contentType },
  })
  await putWithProgress(uploadUrl, file, (f) => onProgress?.(f), contentType)
  await api(`/envelopes/${envelopeId}/attachments/${attachment.id}/complete`, { method: "POST" })
  return { id: attachment.id, name }
}
