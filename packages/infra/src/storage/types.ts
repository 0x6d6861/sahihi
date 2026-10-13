/** A stored object's size and type, or null when it doesn't exist. */
export type ObjectInfo = { sizeBytes: number; contentType: string | null }

export type ObjectStream = {
  body: ReadableStream<Uint8Array>
  contentType: string | null
  sizeBytes: number | null
}

export type DownloadOptions = {
  fileName?: string
  expiresIn?: number
  disposition?: "inline" | "attachment"
}

/**
 * Where a workspace's (or a person's) files live. Every backend can read and write; only Sahihi's
 * own bucket can delete (`DeletableStorage`), because Sahihi never deletes in a customer's bucket
 * (ADR 0051). Workspace files are removed with `releaseObject` / `releasePrefix`, never directly.
 *
 * Uploads from the browser go through four steps, so a file that fails validation never reaches a
 * customer's bucket: `presignUpload` (the browser PUTs there), `uploaded` / `readUpload` (validate),
 * then `commitUpload` or `discardUpload`.
 */
export interface StorageDriver {
  /** "platform": Sahihi's bucket. "customer": the workspace's own (docs/storage.md). */
  readonly kind: "platform" | "customer"
  presignUpload(
    key: string,
    contentType: string,
    sizeBytes: number,
    expiresIn?: number,
  ): Promise<string>
  /** The upload the browser made for `key`, before it's committed. */
  uploaded(key: string): Promise<ObjectInfo | null>
  readUpload(key: string): Promise<Uint8Array>
  /** Validated: store it under `key`. A no-op for Sahihi's bucket (it's already there). */
  commitUpload(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  /** Rejected or abandoned: remove the waiting upload (always in Sahihi's bucket). */
  discardUpload(key: string): Promise<void>
  /**
   * Short-lived GET URL. `inline` for the PDF viewers; `attachment` for "Download" buttons (the
   * browser saves the file instead of opening it). File names may be any language (RFC 6266).
   */
  presignDownload(key: string, opts?: DownloadOptions): Promise<string>
  /**
   * GET URL the browser can cache: the same URL for every request in a 15-minute window, valid
   * for two windows, so it outlives the `max-age` it asks the browser to cache it for. For small
   * images listed on every page view (document thumbnails), not for originals or signed PDFs.
   */
  presignCacheable(key: string, now?: number): Promise<string>
  get(key: string): Promise<Uint8Array>
  /** For streaming a file to the browser; null when it doesn't exist. */
  getStream(key: string): Promise<ObjectStream | null>
  put(key: string, body: Uint8Array, contentType: string): Promise<void>
  /** Uploads a stream of known length (large files, e.g. export archives) without buffering it. */
  putStream(
    key: string,
    body: NodeJS.ReadableStream,
    contentLength: number,
    contentType: string,
  ): Promise<void>
  /** Server-side copy within the backend (template ↔ envelope supporting files). */
  copy(fromKey: string, toKey: string): Promise<void>
  head(key: string): Promise<ObjectInfo | null>
}

export interface DeletableStorage extends StorageDriver {
  readonly kind: "platform"
  delete(key: string): Promise<void>
  /**
   * Deletes every object under `prefix` (1000 per request). Returns how many were deleted.
   * Refuses prefixes that aren't a workspace or user folder, so a bug can't empty the bucket.
   */
  deletePrefix(prefix: string): Promise<number>
}

export const canDelete = (storage: StorageDriver): storage is DeletableStorage =>
  storage.kind === "platform" && "delete" in storage

/** A write would replace an object in a customer's bucket with different bytes (ADR 0051). */
export class WriteOnceError extends Error {
  constructor(readonly key: string) {
    super(`Refusing to overwrite ${key}: storage is write-once`)
    this.name = "WriteOnceError"
  }
}
