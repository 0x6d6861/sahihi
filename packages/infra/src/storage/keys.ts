/**
 * Object keys (docs/architecture.md → Storage). The bucket is private: the browser only gets
 * short-lived presigned URLs, or tickets for files in a customer's bucket (docs/storage.md).
 *
 *   org/{orgId}/documents/{documentId}/original.pdf
 *   org/{orgId}/documents/{documentId}/source.docx                  (upload, until converted)
 *   org/{orgId}/documents/{documentId}/thumbnail[-{v}].png
 *   org/{orgId}/envelopes/{envelopeId}/fields/{fieldId}[-{v}].png
 *   org/{orgId}/envelopes/{envelopeId}/signed.pdf                  (single-document, before ADR 0037)
 *   org/{orgId}/envelopes/{envelopeId}/signed/{envelopeDocumentId}[-{v}].pdf
 *   org/{orgId}/envelopes/{envelopeId}/attachments/{attachmentId}
 *   org/{orgId}/envelopes/{envelopeId}/bundle[-{v}].zip
 *   org/{orgId}/templates/{templateId}/attachments/{attachmentId}
 *   org/{orgId}/envelopes/{envelopeId}/certificate[-{v}].pdf
 *   org/{orgId}/exports/{exportId}[-{v}].zip
 *   org/{orgId}/branding/logo-{version}.png
 *   org/{orgId}/branding/icon-{version}.png
 *   user/{userId}/{signature|initials}-{version}.png
 *   user/{userId}/avatar-{version}.png
 *
 * Every key a job or request can write twice carries a version `{v}` (`objectVersion()`), new on
 * each attempt, so no write ever replaces an object: a customer's bucket is write-once (ADR 0051).
 * Keys stored before versions keep their old form.
 */
const v = (version?: string) => (version ? `-${version}` : "")

export const keys = {
  original: (orgId: string, documentId: string) =>
    `org/${orgId}/documents/${documentId}/original.pdf`,
  /**
   * A Word upload waiting to be converted (ADR 0052). It's an upload, never committed: the worker
   * reads it with `readUpload`, stores the PDF at `original` and discards it.
   */
  wordUpload: (orgId: string, documentId: string) =>
    `org/${orgId}/documents/${documentId}/source.docx`,
  /** First-page preview for the Documents grid (ADR 0033). Same access rules as the original. */
  thumbnail: (orgId: string, documentId: string, version?: string) =>
    `org/${orgId}/documents/${documentId}/thumbnail${v(version)}.png`,
  fieldImage: (orgId: string, envelopeId: string, fieldId: string, version?: string) =>
    `org/${orgId}/envelopes/${envelopeId}/fields/${fieldId}${v(version)}.png`,
  /** Single-document envelopes signed before ADR 0037 keep this key. */
  signed: (orgId: string, envelopeId: string) => `org/${orgId}/envelopes/${envelopeId}/signed.pdf`,
  /** One signed PDF per envelope document (ADR 0037). */
  signedDocument: (
    orgId: string,
    envelopeId: string,
    envelopeDocumentId: string,
    version?: string,
  ) => `org/${orgId}/envelopes/${envelopeId}/signed/${envelopeDocumentId}${v(version)}.pdf`,
  /** A supporting file shared with the recipients (ADR 0037); always served as a download. */
  attachment: (orgId: string, envelopeId: string, attachmentId: string) =>
    `org/${orgId}/envelopes/${envelopeId}/attachments/${attachmentId}`,
  /** "Download all": signed PDFs, certificate and supporting files (ADR 0037). */
  bundle: (orgId: string, envelopeId: string, version?: string) =>
    `org/${orgId}/envelopes/${envelopeId}/bundle${v(version)}.zip`,
  /** A template's own copy of a supporting file (ADR 0037). */
  templateAttachment: (orgId: string, templateId: string, attachmentId: string) =>
    `org/${orgId}/templates/${templateId}/attachments/${attachmentId}`,
  certificate: (orgId: string, envelopeId: string, version?: string) =>
    `org/${orgId}/envelopes/${envelopeId}/certificate${v(version)}.pdf`,
  export: (orgId: string, exportId: string, version?: string) =>
    `org/${orgId}/exports/${exportId}${v(version)}.zip`,
  /** Workspace logo (Settings → Workspace), served publicly by /api/branding. */
  logo: (orgId: string, version: string) => `org/${orgId}/branding/logo-${version}.png`,
  /** The website's icon (Settings → Workspace), served to the workspace's own members only. */
  icon: (orgId: string, version: string) => `org/${orgId}/branding/icon-${version}.png`,
  /** A user's saved signature or initials (Settings → Profile). Not workspace data. */
  savedSignature: (userId: string, kind: "signature" | "initials", version: string) =>
    `user/${userId}/${kind}-${version}.png`,
  /** A user's profile picture (Settings → Profile), served by /api/avatars. */
  avatar: (userId: string, version: string) => `user/${userId}/avatar-${version}.png`,
  /** Everything stored for one user (deleted with their account, ADR 0040). */
  userPrefix: (userId: string) => `user/${userId}/`,
  /** Everything a workspace stores (deleted with the workspace). */
  orgPrefix: (orgId: string) => `org/${orgId}/`,
  /** Everything stored for one envelope (signed PDF, certificate, signature images). */
  envelopePrefix: (orgId: string, envelopeId: string) => `org/${orgId}/envelopes/${envelopeId}/`,
  /**
   * Where a browser upload waits in Sahihi's bucket until it's validated, when the workspace keeps
   * its files in its own bucket: rejected and abandoned uploads never reach the customer.
   */
  staging: (key: string) => `staging/${key}`,
}

/** A fresh version for a key (8 characters). */
export const objectVersion = () => crypto.randomUUID().replace(/-/g, "").slice(0, 8)

/** Where a document's browser upload lands: the Word file for a conversion, else the PDF itself. */
export function documentUploadKey(doc: {
  id: string
  organizationId: string
  s3Key: string
  convertedFrom: string | null
}): string {
  return doc.convertedFrom === "DOCX" ? keys.wordUpload(doc.organizationId, doc.id) : doc.s3Key
}
