import { normalizeCertificateCode } from "@sahihi/core"
import type { Metadata } from "next"
import Link from "next/link"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = { title: "Verify certificate" }

interface VerifyResponse {
  valid: boolean
  certificate?: { code: string; issuedAt: string; provider: string }
  envelope?: {
    title: string
    organization: string
    completedAt: string
    originalSha256: string
    signedSha256: string
    signers: { name: string; email: string; signedAt: string | null; verification: string }[]
  }
}

const MATCH_TEXT: Record<string, string> = {
  signed_document:
    "The file you checked is exactly the signed document for this certificate. It hasn't been changed since signing.",
  certificate: "The file you checked is exactly this Certificate of Completion, unchanged.",
}

/**
 * Public certificate verification: the QR code target, and where `/verify` sends a matching file
 * (`?match=signed_document|certificate`).
 */
export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>
  searchParams: Promise<{ match?: string }>
}) {
  const raw = decodeURIComponent((await params).code)
  const { match } = await searchParams
  const code = normalizeCertificateCode(raw)
  const data: VerifyResponse = code
    ? ((await fetch(
        `${process.env.API_URL ?? "http://localhost:4000"}/api/verify/${encodeURIComponent(code)}`,
        { cache: "no-store" },
      )
        .then((r) => r.json())
        .catch(() => ({ valid: false }))) as VerifyResponse)
    : { valid: false }
  const matchText = match ? MATCH_TEXT[match] : undefined

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-4 md:p-8">
      {!data.valid || !data.envelope || !data.certificate ? (
        <Alert variant="error">
          <AlertTitle>Certificate not found</AlertTitle>
          <AlertDescription>No certificate matches code {code ?? raw}.</AlertDescription>
        </Alert>
      ) : (
        <>
          {matchText && (
            <Alert variant="success">
              <AlertTitle>File verified</AlertTitle>
              <AlertDescription>{matchText}</AlertDescription>
            </Alert>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {data.envelope.title} <Badge variant="success">Verified</Badge>
              </CardTitle>
              <CardDescription>
                {data.envelope.organization} · completed{" "}
                {new Date(data.envelope.completedAt).toUTCString()}
              </CardDescription>
            </CardHeader>
            <CardPanel className="flex flex-col gap-4 text-sm">
              <ul className="flex flex-col gap-1">
                {data.envelope.signers.map((s) => (
                  <li key={s.email}>
                    <span className="font-medium">{s.name}</span>{" "}
                    <span className="text-muted-foreground">{s.email}</span>
                    {s.signedAt && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {new Date(s.signedAt).toUTCString()}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="break-all font-mono text-muted-foreground text-xs">
                <div>Original SHA-256: {data.envelope.originalSha256}</div>
                <div>Signed SHA-256: {data.envelope.signedSha256}</div>
              </div>
            </CardPanel>
          </Card>
        </>
      )}
      <Button variant="link" className="self-start px-0" render={<Link href="/verify" />}>
        Verify another document
      </Button>
    </main>
  )
}
