"use client"

import { useParams, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { site } from "@/content/site"
import { type CertificateRecord, formatWhen, type HashMatch, normalizeCode } from "./verify"

const t = site.verify.certificate

type State =
  | { kind: "loading" }
  | { kind: "found"; record: Required<CertificateRecord> }
  | { kind: "missing" }
  | { kind: "error" }

/**
 * A certificate's public record: the QR code target, and where /verify sends a matching file
 * (`?match=signed_document|certificate`). Fetched in the browser through this site's
 * `/api/verify` proxy, so the page itself stays a static shell.
 */
export function CertificateView() {
  const params = useParams<{ code: string }>()
  const match = useSearchParams().get("match") as HashMatch | null
  const raw = decodeURIComponent(params.code ?? "")
  const code = normalizeCode(raw)
  const [state, setState] = useState<State>(code ? { kind: "loading" } : { kind: "missing" })

  useEffect(() => {
    if (!code) return
    let live = true
    fetch(`/api/verify/${encodeURIComponent(code)}`)
      .then(async (res) => {
        if (res.status === 404) return { kind: "missing" } as const
        if (!res.ok) return { kind: "error" } as const
        const record = (await res.json()) as CertificateRecord
        return record.valid && record.envelope && record.certificate
          ? ({ kind: "found", record: record as Required<CertificateRecord> } as const)
          : ({ kind: "missing" } as const)
      })
      .catch(() => ({ kind: "error" }) as const)
      .then((next) => live && setState(next))
    return () => {
      live = false
    }
  }, [code])

  if (state.kind === "loading") {
    return (
      <p className="text-caption mt-10 font-normal text-muted" aria-live="polite">
        {t.loading}
      </p>
    )
  }
  if (state.kind !== "found") {
    return (
      <div role="alert" className="mt-10 rounded-3xl bg-panel px-6 py-5 md:px-8">
        <p className="text-sub">
          {state.kind === "error" ? site.verify.errors.lookup : t.notFound}
        </p>
        {state.kind === "missing" && (
          <p className="text-caption mt-2 font-normal text-muted">
            {t.notFoundBody} <span className="font-mono text-ink">{code ?? raw}</span>.
          </p>
        )}
      </div>
    )
  }

  const { envelope, certificate } = state.record
  const matched = match ? t.matched[match] : undefined
  return (
    <div className="mt-10 flex flex-col gap-3">
      {matched && (
        <div role="status" className="flex gap-3 rounded-3xl bg-panel px-6 py-5 md:px-8">
          <Check />
          <div>
            <p className="text-sub">{t.fileVerified}</p>
            <p className="text-caption mt-1 font-normal text-muted">{matched}</p>
          </div>
        </div>
      )}

      <section className="rounded-3xl bg-panel px-6 py-6 md:px-8 md:py-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-lede">{envelope.title}</h2>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-paper px-3 py-1 text-[0.875rem]">
            <Check small />
            {t.verified}
          </span>
        </div>
        <p className="text-caption mt-2 font-normal text-muted">
          {envelope.organization} · {t.completed} {formatWhen(envelope.completedAt)} ·{" "}
          {certificate.code}
        </p>

        <h3 className="text-caption mt-8">{t.signers}</h3>
        <ul className="mt-2 flex flex-col gap-1.5">
          {envelope.signers.map((s) => (
            <li key={`${s.name}-${s.email}`} className="text-caption font-normal text-muted">
              <span className="font-medium text-ink">{s.name}</span> {s.email}
              {s.signedAt && <> · {formatWhen(s.signedAt)}</>}
            </li>
          ))}
        </ul>

        <h3 className="text-caption mt-8">{t.documents}</h3>
        <ol className="mt-2 flex flex-col gap-4">
          {envelope.documents.map((d, i) => (
            <li key={d.signedSha256 ?? d.originalSha256 ?? d.name}>
              <p className="text-caption">
                {envelope.documents.length > 1 ? `${i + 1}. ` : ""}
                {d.name}
              </p>
              <dl className="mt-1 break-all font-mono text-[0.8125rem] leading-6 text-muted">
                <div>
                  <dt className="inline">{t.original}: </dt>
                  <dd className="inline">{d.originalSha256}</dd>
                </div>
                <div>
                  <dt className="inline">{t.signed}: </dt>
                  <dd className="inline">{d.signedSha256}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>

        {envelope.attachments.length > 0 && (
          <>
            <h3 className="text-caption mt-8">{t.attachments}</h3>
            <ul className="mt-2 flex flex-col gap-1 break-all font-mono text-[0.8125rem] leading-6 text-muted">
              {envelope.attachments.map((a) => (
                <li key={a.sha256 ?? a.name}>
                  <span className="font-sans text-ink">{a.name}</span>: {a.sha256}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}

function Check({ small = false }: { small?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`shrink-0 text-[#15803d] dark:text-[#4ade80] ${small ? "size-4" : "mt-1 size-5"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}
