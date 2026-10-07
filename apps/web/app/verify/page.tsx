import type { Metadata } from "next"
import { Panel } from "@/components/app/panel"
import { VerifyChecker } from "./verify-checker"

export const metadata: Metadata = { title: "Verify a document" }

/** Public: check a signed PDF or certificate without an account. */
export default function VerifyIndexPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-4 md:p-8">
      <Panel
        headingLevel={1}
        title="Verify a document signed with Sahihi"
        description="Check that a signed PDF or its Certificate of Completion is genuine and hasn't been changed since it was signed."
      >
        <VerifyChecker />
      </Panel>
    </main>
  )
}
