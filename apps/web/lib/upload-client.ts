"use client"

import { api } from "./api"
import { prepareUpload, type UploadStage } from "./upload"

/** PUT to the presigned S3 URL. XHR rather than fetch, because fetch has no upload progress. */
function putWithProgress(url: string, file: Blob, onProgress: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    xhr.setRequestHeader("Content-Type", "application/pdf")
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
    onStage?: (stage: UploadStage, fraction?: number) => void
  } = {},
): Promise<{ id: string; name: string }> {
  const prepared = prepareUpload(file)
  if (!prepared.ok) throw new UploadRejectedError(prepared.message)
  const input = opts.sourceDocumentId
    ? { ...prepared.input, sourceDocumentId: opts.sourceDocumentId }
    : prepared.input

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
