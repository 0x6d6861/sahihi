/**
 * Content Security Policy for every page (docs/security.md → Headers & transport).
 * Built per request in `proxy.ts` with a fresh nonce; Next.js adds that nonce to its own scripts.
 */

/** The Extend PDF viewer's engine (EmbedPDF/pdfium) fetches its wasm and fallback fonts here. */
export const PDF_ENGINE_CDN = "https://cdn.jsdelivr.net"

export interface CspOptions {
  nonce: string
  dev: boolean
  /**
   * Origin of the presigned S3/MinIO URLs: uploads PUT to it and the viewers fetch PDFs from it.
   * Null blocks both, so production requires STORAGE_ORIGIN (next.config.ts).
   */
  storageOrigin: string | null
  /** Origin of the error-tracking ingest (from NEXT_PUBLIC_SENTRY_DSN); null when off. */
  errorReportingOrigin?: string | null
}

export function buildCsp({ nonce, dev, storageOrigin, errorReportingOrigin }: CspOptions): string {
  const storage = storageOrigin ? [storageOrigin] : []
  const reporting = errorReportingOrigin ? [errorReportingOrigin] : []
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // strict-dynamic: chunks loaded by nonce'd Next scripts are trusted; hosts are ignored.
    // wasm-unsafe-eval: pdfium compiles WebAssembly (nothing else may eval).
    // React needs eval in development only, for its debugging stacks.
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      "'wasm-unsafe-eval'",
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    // Base UI and Extend set inline style attributes, which nonces can't cover. Style injection
    // can't run code; scripts stay nonce-only.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "blob:", "data:", ...storage],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", PDF_ENGINE_CDN, ...storage, ...reporting],
    // The PDF engine runs in blob: workers (blob workers inherit this policy).
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    // Nobody may frame us: stops clickjacking of "Sign", "Send" and "Void".
    "frame-ancestors": ["'none'"],
  }
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`)
  // Local MinIO is plain http; upgrading it would break uploads in development.
  if (!dev) policy.push("upgrade-insecure-requests")
  return policy.join("; ")
}

/** Origin of a URL, or null when it isn't an http(s) URL. */
export function toOrigin(url: string | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : null
  } catch {
    return null
  }
}

/** A fresh CSP nonce: 128 random bits, base64. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
}

/** App routes that need a session (the optimistic cookie check in proxy.ts). */
const PROTECTED_PREFIXES = ["/documents", "/envelopes", "/templates", "/settings", "/onboarding"]

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}
