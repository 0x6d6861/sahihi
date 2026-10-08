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

/**
 * The upload flow (docs/pdf-pipeline.md → Upload): create → PUT to the presigned URL → complete.
 * The server validates and hashes the bytes on `complete`. Returns the new document's id.
 * Throws `UploadRejectedError` when the file fails the client pre-check (nothing is sent).
 */
export async function uploadPdf(
  file: File,
  opts: {
    sourceDocumentId?: string
    /** Folder the document lands in (ADR 0022); omitted = workspace root. */
    folderId?: string
    onStage?: (stage: UploadStage, fraction?: number) => void
  } = {},
): Promise<{ id: string; name: string }> {
  const prepared = prepareUpload(file)
  if (!prepared.ok) throw new UploadRejectedError(prepared.message)
  const input = {
    ...prepared.input,
    ...(opts.sourceDocumentId && { sourceDocumentId: opts.sourceDocumentId }),
    ...(opts.folderId && { folderId: opts.folderId }),
  }

  opts.onStage?.("creating")
  const { document, uploadUrl } = await api<{ document: { id: string }; uploadUrl: string }>(
    "/documents/uploads",
    { method: "POST", json: input },
  )
  opts.onStage?.("uploading", 0)
  await putWithProgress(uploadUrl, file, (f) => opts.onStage?.("uploading", f))
  opts.onStage?.("checking")
  await api(`/documents/${document.id}/complete`, { method: "POST" })
  opts.onStage?.("done")
  return { id: document.id, name: input.name }
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
