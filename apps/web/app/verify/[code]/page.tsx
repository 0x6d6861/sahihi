import { normalizeCertificateCode } from "@sahihi/core"
import type { Metadata } from "next"
import Link from "next/link"
import { CheckIcon, CircleCheckIcon } from "@/components/app/icons"
import { stagger } from "@/components/app/motion"
import { Alert } from "@/components/arc/alert/alert"
import { Avatar } from "@/components/arc/avatar/avatar"
import { CopyButton } from "@/components/arc/copy-button/copy-button"
import { API_URL } from "@/lib/api-url"
import { formatDateTime, pluralize } from "@/lib/format"

import { MatchAlert } from "./match-alert"

export const metadata: Metadata = { title: "Verify certificate" }

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

interface VerifyResponse {
  valid: boolean
  certificate?: { code: string; issuedAt: string; provider: string }
  envelope?: {
    title: string
    organization: string
    completedAt: string
    /** Every signed document with both hashes, in signing order (ADR 0037). */
    documents: {
      name: string
      pageCount: number | null
      originalSha256: string | null
      signedSha256: string | null
    }[]
    /** Supporting files shared with the signers, not signed. */
    attachments: { name: string; sha256: string | null }[]
    signers: { name: string; email: string; signedAt: string | null; verification: string }[]
  }
}

/**
 * Public certificate verification: the QR code target, and where `/verify` sends a matching file
 * (the match itself travels in sessionStorage, see MatchAlert).
 */
export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const raw = safeDecode((await params).code)
  const code = normalizeCertificateCode(raw)
  const data: VerifyResponse = code
    ? ((await fetch(`${API_URL}/api/verify/${encodeURIComponent(code)}`, { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({ valid: false }))) as VerifyResponse)
    : { valid: false }

  const e = data.valid ? data.envelope : undefined
  const cert = data.valid ? data.certificate : undefined

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 pt-4 pb-12 md:pt-8">
      {!e || !cert ? (
        <Alert tone="danger" title="Certificate not found">
          No certificate matches code {code ?? raw}.
        </Alert>
      ) : (
        <>
          <MatchAlert code={cert.code} />
          <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-success/30 bg-success/10 px-4 py-3">
            <CircleCheckIcon aria-hidden className="size-5 text-success-foreground" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium text-success-foreground text-sm">
                Certificate verified
              </span>
              <span className="text-muted-foreground text-xs">
                Issued {formatDateTime(new Date(cert.issuedAt))}
              </span>
            </div>
            <span className="font-mono text-sm">{cert.code}</span>
            <CopyButton value={cert.code} label="Copy code" iconOnly />
          </section>

          <section className="flex flex-col gap-6 rounded-2xl border bg-card p-5 md:p-6">
            <h1 className="font-medium text-2xl tracking-tight">{e.title}</h1>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ["Sent by", e.organization],
                ["Completed", formatDateTime(new Date(e.completedAt))],
                ["Signers", pluralize(e.signers.length, "signer")],
                ["Documents", pluralize(e.documents.length, "document")],
              ].map(([label, value]) => (
                <div key={label} className="flex min-w-0 flex-col gap-0.5">
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd className="truncate text-sm">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-col gap-2">
              <h2 className="font-medium text-sm">Signers</h2>
              <ul className="divide-y rounded-xl border">
                {e.signers.map((s, i) => (
                  <li
                    key={s.email}
                    className="enter-fade flex items-center gap-3 px-3 py-2.5"
                    style={stagger(i)}
                  >
                    <Avatar name={s.name} size="sm" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium text-sm">{s.name}</span>
                      <span className="truncate text-muted-foreground text-xs">{s.email}</span>
                    </div>
                    {s.signedAt && (
                      <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs">
                        <CheckIcon aria-hidden className="size-3.5 text-success-foreground" />
                        {formatDateTime(new Date(s.signedAt))}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="font-medium text-sm">Signed documents</h2>
              <ol className="flex flex-col gap-3">
                {e.documents.map((d, i) => (
                  <li
                    key={d.signedSha256 ?? d.originalSha256 ?? d.name}
                    className="flex flex-col gap-2 rounded-xl border p-3"
                  >
                    <span className="font-medium text-sm">
                      {e.documents.length > 1 ? `${i + 1}. ` : ""}
                      {d.name}
                      {d.pageCount ? (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · {pluralize(d.pageCount, "page")}
                        </span>
                      ) : null}
                    </span>
                    <HashRow label="Signed" hash={d.signedSha256} />
                    <HashRow label="Original" hash={d.originalSha256} />
                  </li>
                ))}
              </ol>
            </div>

            {e.attachments.length > 0 && (
              <div className="flex flex-col gap-2">
                <h2 className="font-medium text-sm">Supporting files (shared, not signed)</h2>
                <ul className="flex flex-col gap-2">
                  {e.attachments.map((a) => (
                    <li
                      key={a.sha256 ?? a.name}
                      className="flex flex-col gap-1 rounded-xl border p-3"
                    >
                      <span className="text-sm">{a.name}</span>
                      <HashRow label="SHA-256" hash={a.sha256} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </>
      )}
      <Link
        href="/verify"
        className="self-start text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
      >
        Verify another document
      </Link>
    </main>
  )
}

/** A SHA-256 on one muted line, with a copy button. */
function HashRow({ label, hash }: { label: string; hash: string | null }) {
  if (!hash) return null
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted/60 px-2.5 py-1.5">
      <span className="w-16 shrink-0 text-muted-foreground text-xs">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs" title={hash}>
        {hash}
      </span>
      <CopyButton
        value={hash}
        label={`Copy ${label.toLowerCase()} hash`}
        iconOnly
        variant="plain"
      />
    </div>
  )
}
