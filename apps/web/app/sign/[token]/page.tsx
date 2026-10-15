import type { Metadata } from "next"
import { SigningExperience } from "./signing-experience"

export const metadata: Metadata = {
  title: "Review & sign",
  robots: { index: false, follow: false },
}

/**
 * PUBLIC signing page — no better-auth session. The token in the URL is the
 * credential; it is passed to the API and never logged or stored client-side.
 */
export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (
    <main className="app-canvas flex min-h-dvh w-full flex-col lg:h-dvh lg:overflow-hidden">
      <SigningExperience token={token} />
    </main>
  )
}
