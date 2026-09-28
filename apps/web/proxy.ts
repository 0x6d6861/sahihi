import { getSessionCookie } from "better-auth/cookies"
import { type NextRequest, NextResponse } from "next/server"

/**
 * Next 16 "proxy" (formerly middleware). Cheap optimistic check only — the
 * API re-validates every request. Public routes: /sign, /verify, auth pages.
 */
export function proxy(request: NextRequest) {
  const hasSession = Boolean(getSessionCookie(request, { cookiePrefix: "sahihi" }))
  if (!hasSession) {
    const url = new URL("/sign-in", request.url)
    url.searchParams.set("next", request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/documents/:path*", "/envelopes/:path*", "/settings/:path*", "/onboarding"],
}
