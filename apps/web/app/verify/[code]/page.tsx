import type { Metadata } from "next"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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

/**
 * Public certificate verification (QR code target).
 * TODO(roadmap P4): add "drop a PDF to verify" — hash in the browser with
 * crypto.subtle and POST /api/verify/hash (never upload the file).
 */
export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const res = await fetch(
    `${process.env.API_URL ?? "http://localhost:4000"}/api/verify/${encodeURIComponent(code)}`,
    {
      cache: "no-store",
    },
  )
  const data = (await res.json().catch(() => ({ valid: false }))) as VerifyResponse

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-4 md:p-8">
      {!data.valid || !data.envelope || !data.certificate ? (
        <Alert variant="error">
          <AlertTitle>Certificate not found</AlertTitle>
          <AlertDescription>No certificate matches code {code}.</AlertDescription>
        </Alert>
      ) : (
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
      )}
    </main>
  )
}
