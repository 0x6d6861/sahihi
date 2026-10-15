"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/app/button"
import { DownloadIcon, FileTextIcon, SignatureIcon } from "@/components/app/icons"
import { getSession } from "@/lib/auth-client"

/** sessionStorage key: the signer's email, handed to /sign-up without putting it in the URL. */
export const SIGNUP_EMAIL_KEY = "sahihi-signup-email"

const POINTS = [
  {
    icon: FileTextIcon,
    title: "Every signed document in one place",
    body: "From any company that sends you documents with Sahihi.",
  },
  {
    icon: DownloadIcon,
    title: "Download copies and certificates any time",
    body: "No more digging through old emails for the link.",
  },
  {
    icon: SignatureIcon,
    title: "Sign faster next time",
    body: "Save your signature once and place it with one click.",
  },
]

/**
 * After signing (ADR 0062): an optional free account to keep track of what you sign. Never
 * required, never in the way: "Continue without an account" hides it, and someone already signed
 * in gets a link to their Signed documents instead. The signing token plays no part in the account;
 * the email is only prefilled and must be confirmed.
 */
export function AccountInvite({ email }: { email: string | null }) {
  const router = useRouter()
  const [state, setState] = useState<"loading" | "signed-in" | "invite" | "dismissed">("loading")

  useEffect(() => {
    let active = true
    getSession()
      .then(({ data }) => active && setState(data?.user ? "signed-in" : "invite"))
      .catch(() => active && setState("invite"))
    return () => {
      active = false
    }
  }, [])

  if (state === "loading" || state === "dismissed") return null
  if (state === "signed-in") {
    return (
      <p className="text-center text-muted-foreground text-sm">
        <Link href="/signed" className="text-foreground underline underline-offset-4">
          See it in your signed documents
        </Link>
      </p>
    )
  }

  function create() {
    try {
      if (email) sessionStorage.setItem(SIGNUP_EMAIL_KEY, email)
    } catch {
      // Private mode: they type the email themselves.
    }
    router.push("/sign-up?from=signing")
  }

  return (
    <section
      aria-labelledby="account-invite"
      className="enter-fade flex flex-col gap-4 rounded-2xl bg-muted/60 p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="account-invite" className="font-medium">
          Keep track of what you sign
        </h2>
        <p className="text-muted-foreground text-sm">
          A free Sahihi account, separate from any company&apos;s workspace. You don&apos;t need one
          to sign.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {POINTS.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex items-start gap-3">
            <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="flex flex-col">
              <span className="text-sm">{title}</span>
              <span className="text-muted-foreground text-xs">{body}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2">
        <Button className="w-full" onClick={create}>
          Create a free account
        </Button>
        {email && (
          <p className="text-center text-muted-foreground text-xs">
            Uses {email}. You&apos;ll confirm it once.
          </p>
        )}
        <Button variant="ghost" className="w-full" onClick={() => setState("dismissed")}>
          Continue without an account
        </Button>
      </div>
    </section>
  )
}
