import { getSessionCookie } from "better-auth/cookies"
import { type NextRequest, NextResponse } from "next/server"
import { buildCsp, createNonce, isProtectedPath, toOrigin } from "@/lib/csp"

const DEV = process.env.NODE_ENV === "development"
// Where presigned upload/download URLs point (S3 or MinIO). next.config.ts requires it in production.
const STORAGE_ORIGIN = toOrigin(process.env.STORAGE_ORIGIN ?? (DEV ? "http://localhost:9000" : ""))

/**
 * Next 16 "proxy" (formerly middleware), on every page request:
 * 1. Content Security Policy with a per-request nonce (docs/security.md → Headers & transport).
 *    Next.js reads the nonce from the request's CSP header and puts it on its own scripts.
 * 2. For app routes, a cheap optimistic session-cookie check. The API re-validates everything.
 *    Public routes: /sign, /verify, auth pages.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (isProtectedPath(pathname) && !getSessionCookie(request, { cookiePrefix: "sahihi" })) {
    const url = new URL("/sign-in", request.url)
    url.searchParams.set("next", pathname)
    return NextResponse.redirect(url)
  }

  const nonce = createNonce()
  const csp = buildCsp({ nonce, dev: DEV, storageOrigin: STORAGE_ORIGIN })
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
