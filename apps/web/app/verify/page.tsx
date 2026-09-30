import type { Metadata } from "next"
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card"
import { VerifyChecker } from "./verify-checker"

export const metadata: Metadata = { title: "Verify a document" }

/** Public: check a signed PDF or certificate without an account. */
export default function VerifyIndexPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-4 md:p-8">
      <Card>
        <CardHeader>
          <CardTitle>Verify a document signed with Sahihi</CardTitle>
          <CardDescription>
            Check that a signed PDF or its Certificate of Completion is genuine and hasn't been
            changed since it was signed.
          </CardDescription>
        </CardHeader>
        <CardPanel>
          <VerifyChecker />
        </CardPanel>
      </Card>
    </main>
  )
}
