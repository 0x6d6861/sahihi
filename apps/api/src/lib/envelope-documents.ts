/**
 * How the API selects and returns an envelope's documents and supporting files (ADR 0037), so the
 * sender routes, the signing routes and the public API agree on one shape.
 */

import {
  bundleFileName,
  downloadFileName,
  safeFileName,
  signedDocumentFileName,
} from "@sahihi/core"
import { presignDownload } from "@sahihi/infra"
import { HTTPException } from "hono/http-exception"

/** Prisma `include`/`select` for an envelope's documents, in order. */
export const envelopeDocumentsSelect = {
  orderBy: { order: "asc" },
  select: {
    id: true,
    order: true,
    documentId: true,
    signedS3Key: true,
    signedSha256: true,
    document: {
      select: { id: true, name: true, pageCount: true, pages: true, sha256: true, s3Key: true },
    },
  },
} as const

/** Prisma `include` for an envelope's supporting files, in order. */
export const envelopeAttachmentsSelect = {
  orderBy: { order: "asc" },
  select: {
    id: true,
    name: true,
    contentType: true,
    sizeBytes: true,
    sha256: true,
    status: true,
    order: true,
    createdAt: true,
    s3Key: true,
  },
} as const

type DocumentRow = {
  id: string
  order: number
  documentId: string
  signedSha256: string | null
  document: {
    id: string
    name: string
    pageCount: number | null
    pages: unknown
    sha256: string | null
  }
}

/**
 * One envelope document as the API returns it: `id` is the envelope document (what fields point
 * at); `documentId` is the library document. Storage keys never leave the API.
 */
export const documentView = (d: DocumentRow) => ({
  id: d.id,
  documentId: d.documentId,
  order: d.order,
  name: d.document.name,
  pageCount: d.document.pageCount,
  pages: d.document.pages,
  sha256: d.document.sha256,
  signedSha256: d.signedSha256,
})

type AttachmentRow = {
  id: string
  name: string
  contentType: string
  sizeBytes: number
  sha256: string | null
  status: string
  order: number
  createdAt: Date
}

export const attachmentView = (a: AttachmentRow) => ({
  id: a.id,
  name: a.name,
  contentType: a.contentType,
  sizeBytes: a.sizeBytes,
  sha256: a.sha256,
  status: a.status,
  order: a.order,
  createdAt: a.createdAt,
})

/** Total pages across documents, for the envelope's page limit. */
export const totalPages = (rows: { document: { pageCount: number | null } }[]) =>
  rows.reduce((n, d) => n + (d.document.pageCount ?? 0), 0)

type DownloadSource = {
  title: string
  bundleS3Key: string | null
  certificate: { s3Key: string } | null
  documents: { id: string; signedS3Key: string | null; document: { name: string } }[]
  attachments: { id: string; name: string; s3Key: string; status: string }[]
}

/**
 * Presigned downloads of a finalized envelope (ADR 0037): each signed document, the certificate,
 * the supporting files and "Download all". All are attachments (saved, never shown inline).
 * `signed` is the first document's, kept for callers built before multi-document envelopes.
 * 409 until finalize has produced every signed PDF and the certificate.
 */
export async function downloadLinks(e: DownloadSource) {
  if (!e.certificate || e.documents.some((d) => !d.signedS3Key)) {
    throw new HTTPException(409, {
      res: Response.json(
        { error: "conflict", message: "Envelope is not finalized yet" },
        { status: 409 },
      ),
    })
  }
  const download = (key: string, fileName: string) =>
    presignDownload(key, { fileName, disposition: "attachment" })
  // One document: named after the envelope, as before ADR 0037. Several: each keeps its name.
  const nameOf = (d: { document: { name: string } }) =>
    e.documents.length === 1
      ? downloadFileName(e.title, "signed")
      : signedDocumentFileName(d.document.name)
  const documents = await Promise.all(
    e.documents.map(async (d) => ({
      id: d.id,
      name: nameOf(d),
      url: await download(d.signedS3Key as string, nameOf(d)),
    })),
  )
  return {
    documents,
    signed: documents[0]?.url ?? null,
    certificate: await download(e.certificate.s3Key, downloadFileName(e.title, "certificate")),
    attachments: await Promise.all(
      e.attachments
        .filter((a) => a.status === "READY")
        .map(async (a) => ({
          id: a.id,
          name: a.name,
          url: await download(a.s3Key, safeFileName(a.name)),
        })),
    ),
    bundle: e.bundleS3Key ? await download(e.bundleS3Key, bundleFileName(e.title)) : null,
  }
}
