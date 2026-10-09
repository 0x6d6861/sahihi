import { SignatureIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

/** Auth pages: the Sahihi mark above the panel, so people know where they are before typing a password. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <p className="flex items-center gap-2 font-medium text-lg">
        {/* Arc's accent, as in the app bar. */}
        <HugeiconsIcon
          icon={SignatureIcon}
          size={26}
          strokeWidth={2}
          aria-hidden
          style={{ color: "var(--accent)" }}
        />
        Sahihi
      </p>
      {children}
    </main>
  )
}
