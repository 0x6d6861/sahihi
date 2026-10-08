import { type CreateUploadInput, CreateUploadSchema, MAX_UPLOAD_BYTES } from "@sahihi/core"

/** The parts of a browser `File` the upload flow looks at. */
export interface UploadCandidate {
  name: string
  size: number
  type: string
}

export type PrepareUploadResult =
  | { ok: true; input: CreateUploadInput }
  | { ok: false; message: string }

const MAX_NAME_LENGTH = 200

/**
 * Client-side pre-check for `POST /documents/uploads`, using the same schema as the API.
 * Some browsers and OSes report an empty MIME type for PDFs, so a `.pdf` extension also counts.
 * The server still re-validates the bytes on `complete`.
 */
export function prepareUpload(file: UploadCandidate): PrepareUploadResult {
  const isPdf = file.type === "application/pdf" || (!file.type && /\.pdf$/i.test(file.name))
  if (!isPdf) return { ok: false, message: "Only PDF files are supported." }
  if (file.size === 0) return { ok: false, message: "This file is empty." }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      message: `This file is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
    }
  }
  const parsed = CreateUploadSchema.safeParse({
    name: file.name.trim().slice(0, MAX_NAME_LENGTH) || "document.pdf",
    sizeBytes: file.size,
    contentType: "application/pdf",
  })
  if (!parsed.success) return { ok: false, message: "This file can't be uploaded." }
  return { ok: true, input: parsed.data }
}

export type UploadStage = "creating" | "uploading" | "checking" | "done"

/**
 * Overall progress (0–100) across the three requests. The S3 PUT gets most of the bar;
 * `fraction` is its loaded/total ratio and is ignored for the other stages.
 */
export function uploadPercent(stage: UploadStage, fraction = 0): number {
  switch (stage) {
    case "creating":
      return 5
    case "uploading": {
      const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0
      return Math.round(5 + f * 85)
    }
    case "checking":
      return 95
    case "done":
      return 100
  }
}

export const UPLOAD_STAGE_LABEL: Record<UploadStage, string> = {
  creating: "Preparing upload…",
  uploading: "Uploading…",
  checking: "Checking the PDF…",
  done: "Done",
}

/** Most PDFs one drop uploads; the rest are skipped with a message. */
export const MAX_BATCH_UPLOADS = 20

/**
 * Several dropped files (ADR 0039): the ones `prepareUpload` accepts, up to `MAX_BATCH_UPLOADS`,
 * and the rest with the reason each one is skipped.
 */
export function splitUploads<T extends UploadCandidate>(
  files: readonly T[],
): { accepted: T[]; skipped: { file: T; message: string }[] } {
  const accepted: T[] = []
  const skipped: { file: T; message: string }[] = []
  for (const file of files) {
    const prepared = prepareUpload(file)
    if (!prepared.ok) skipped.push({ file, message: prepared.message })
    else if (accepted.length >= MAX_BATCH_UPLOADS) {
      skipped.push({ file, message: `Upload at most ${MAX_BATCH_UPLOADS} files at a time.` })
    } else accepted.push(file)
  }
  return { accepted, skipped }
}

/** The toast after a batch: "3 documents uploaded", "2 uploaded, 1 failed". */
export function batchSummary(uploaded: number, failed: number): string {
  if (failed === 0) return uploaded === 1 ? "Document uploaded" : `${uploaded} documents uploaded`
  if (uploaded === 0) return failed === 1 ? "Upload failed" : `${failed} uploads failed`
  return `${uploaded} uploaded, ${failed} failed`
}
