import { getSessionCookie } from "better-auth/cookies"
import { type NextRequest, NextResponse } from "next/server"
import { API_URL } from "@/lib/api-url"
import { buildCsp, createNonce, isProtectedPath, toOrigin } from "@/lib/csp"

const DEV = process.env.NODE_ENV === "development"
// Where presigned upload/download URLs point (S3 or MinIO). next.config.ts requires it in production.
const STORAGE_ORIGIN = toOrigin(process.env.STORAGE_ORIGIN ?? (DEV ? "http://localhost:9000" : ""))
// Browser error reports go to the DSN's host (docs/observability.md).
const ERROR_REPORTING_ORIGIN = toOrigin(process.env.NEXT_PUBLIC_SENTRY_DSN)

/**
 * Next 16 "proxy" (formerly middleware), on every page request:
 * 1. Content Security Policy with a per-request nonce (docs/security.md → Headers & transport).
 *    Next.js reads the nonce from the request's CSP header and puts it on its own scripts.
 * 2. For app routes, a cheap optimistic session-cookie check. The API re-validates everything.
 *    Public routes: /sign, /verify, auth pages.
 */
const EMBED_PATH = /^\/sign\/([A-Za-z0-9_-]{43})$/

/**
 * Embedded signing (docs/embedded-signing.md): /sign/<token>?embed=1 may be framed by the
 * workspace's allowed origins, and only for an EMBEDDED recipient. Asks the API (which validates
 * the token); any failure means no framing.
 */
async function frameAncestorsFor(request: NextRequest): Promise<string[]> {
  const token = request.nextUrl.pathname.match(EMBED_PATH)?.[1]
  if (!token || request.nextUrl.searchParams.get("embed") !== "1") return []
  try {
    const res = await fetch(`${API_URL}/api/sign/${token}/embed`, {
      headers: { "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "" },
      signal: AbortSignal.timeout(2_000),
      cache: "no-store",
    })
    if (!res.ok) return []
    const body = (await res.json()) as { origins?: unknown }
    return Array.isArray(body.origins)
      ? body.origins.filter((o): o is string => typeof o === "string" && toOrigin(o) === o)
      : []
  } catch {
    return []
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (isProtectedPath(pathname) && !getSessionCookie(request, { cookiePrefix: "sahihi" })) {
    const url = new URL("/sign-in", request.url)
    url.searchParams.set("next", pathname)
    return NextResponse.redirect(url)
  }

  const nonce = createNonce()
  const csp = buildCsp({
    nonce,
    dev: DEV,
    storageOrigin: STORAGE_ORIGIN,
    errorReportingOrigin: ERROR_REPORTING_ORIGIN,
    frameAncestors: await frameAncestorsFor(request),
  })
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("Content-Security-Policy", csp)
  return response
}

export const config = {
  matcher: [
    {
      // Every page; not the API rewrite, static assets or prefetches (they carry no HTML).
      source: "/((?!api/|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
