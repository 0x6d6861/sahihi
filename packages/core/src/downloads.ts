/**
 * File names and Content-Disposition for downloads of signed PDFs and certificates
 * (docs/pdf-pipeline.md → Downloads). Titles are user input in any language.
 */

export type DownloadKind = "signed" | "certificate"

const MAX_BASE_LENGTH = 120

/**
 * `Lease 2026` → `Lease 2026 (signed).pdf`. Keeps letters and digits in any script, and replaces
 * characters that are unsafe in file names or headers (quotes, slashes, control characters). Falls
 * back to "document".
 */
export function downloadFileName(title: string, kind: DownloadKind): string {
  const base =
    title
      .normalize("NFC")
      .replace(/[^\p{L}\p{N}\s.,_()'&+-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_BASE_LENGTH)
      .trim() || "document"
  return `${base} (${kind === "signed" ? "signed" : "certificate"}).pdf`
}

/**
 * RFC 6266 Content-Disposition: an ASCII `filename` fallback for old clients plus `filename*` with
 * the exact UTF-8 name.
 */
export function contentDisposition(
  fileName: string,
  type: "attachment" | "inline" = "attachment",
): string {
  const ascii =
    fileName
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "") // drop accents: é → e
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_") || "download.pdf"
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`
}
