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
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-4 p-4 md:px-8 md:py-6">
      <SigningExperience token={token} />
    </main>
  )
}
