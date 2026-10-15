import type { Metadata } from "next"
import { CheckIcon, FileSearchIcon, UsersIcon } from "@/components/app/icons"
import { VerifyChecker } from "./verify-checker"

export const metadata: Metadata = { title: "Verify a document" }

const STEPS = [
  {
    icon: FileSearchIcon,
    title: "Fingerprinted on your device",
    body: "Your browser computes the file's SHA-256. The file itself is never uploaded.",
  },
  {
    icon: CheckIcon,
    title: "Matched to its record",
    body: "Sahihi looks the fingerprint up among the documents it sealed and their certificates.",
  },
  {
    icon: UsersIcon,
    title: "See who signed and when",
    body: "A match shows the certificate: the signers, when each signed and the document hashes.",
  },
]

/** Public: check a signed PDF or certificate without an account. */
export default function VerifyIndexPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-4 pt-6 pb-12 md:pt-12">
      <header className="flex flex-col gap-3 text-center">
        <h1 className="text-balance font-medium text-3xl tracking-tight md:text-4xl">
          Verify a document signed with Sahihi
        </h1>
        <p className="text-balance text-muted-foreground">
          Check that a signed PDF or its Certificate of Completion is genuine and hasn't been
          changed since it was signed.
        </p>
      </header>
      <section className="rounded-2xl border bg-card p-5">
        <VerifyChecker />
      </section>
      <section aria-labelledby="how-heading" className="flex flex-col gap-4">
        <h2 id="how-heading" className="font-medium text-base">
          How verification works
        </h2>
        <ol className="grid gap-5 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex flex-col gap-1.5">
              <Icon aria-hidden className="size-5 text-muted-foreground" />
              <span className="font-medium text-sm">{title}</span>
              <span className="text-muted-foreground text-sm">{body}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}
