"use client"

import Link from "next/link"
import { useState } from "react"
import { Badge, type BadgeTone } from "@/components/app/badge"
import { Button } from "@/components/app/button"
import { DownloadIcon, MailIcon, PenLineIcon, ShieldCheckIcon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import { ApiError, api } from "@/lib/api"
import { formatDate } from "@/lib/format"

export interface SignedItem {
  recipientId: string
  title: string
  workspace: string
  sender: string
  status: string
  signedAt: string | null
  envelopeStatus: string
  sentAt: string | null
  completedAt: string | null
  purged: boolean
  group: "waiting" | "signed" | "closed"
  certificateCode: string | null
  canDownload: boolean
  canRequestLink: boolean
}

function statusOf(i: SignedItem): { label: string; tone: BadgeTone } {
  if (i.purged) return { label: "Files deleted by sender", tone: "neutral" }
  if (i.envelopeStatus === "COMPLETED") return { label: "Completed", tone: "success" }
  if (i.group === "signed") return { label: "Waiting for others", tone: "info" }
  if (i.status === "DECLINED" || i.envelopeStatus === "DECLINED") {
    return { label: "Declined", tone: "danger" }
  }
  if (i.envelopeStatus === "VOIDED") return { label: "Voided", tone: "neutral" }
  if (i.envelopeStatus === "EXPIRED") return { label: "Expired", tone: "warning" }
  return { label: "Waiting for you", tone: "info" }
}

/** "Download": the bundle (or the signed PDF), fetched on click; the links live 5 minutes. */
function DownloadButton({ item }: { item: SignedItem }) {
  const [busy, setBusy] = useState(false)
  async function download() {
    setBusy(true)
    try {
      const links = await api<{ bundle: string | null; documents: { url: string }[] }>(
        `/me/envelopes/${item.recipientId}/downloads`,
      )
      const url = links.bundle ?? links.documents[0]?.url
      if (url) window.location.assign(url)
    } catch (err) {
      toastManager.add({
        title:
          err instanceof ApiError && err.status === 409
            ? "Still preparing the documents"
            : "Download failed",
        type: "error",
      })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button variant="ghost" size="sm" loading={busy} onClick={download}>
      <DownloadIcon aria-hidden />
      Download
    </Button>
  )
}

/** Emails a fresh signing link (the link never reaches this page). */
function RequestLinkButton({ item, primary = false }: { item: SignedItem; primary?: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle")
  async function send() {
    setState("busy")
    try {
      await api(`/me/envelopes/${item.recipientId}/link`, { method: "POST" })
      setState("sent")
    } catch (err) {
      setState("idle")
      const cooldown = err instanceof ApiError && err.status === 429
      toastManager.add({
        title: cooldown ? "A link was sent recently" : "Couldn't send a new link",
        description: cooldown ? "Check your email, or try again in a few minutes." : undefined,
        type: cooldown ? "info" : "error",
      })
    }
  }
  if (state === "sent") {
    return <span className="text-muted-foreground text-sm">Link sent. Check your email.</span>
  }
  return (
    <Button
      variant={primary ? "primary" : "ghost"}
      size="sm"
      loading={state === "busy"}
      onClick={send}
    >
      <MailIcon aria-hidden />
      Email me the signing link
    </Button>
  )
}

/**
 * A signer's envelopes (ADR 0062): what still waits for them, then what they signed or that
 * closed, newest first. Completed ones download; purged ones keep their certificate, so they
 * point to Verify.
 */
export function SignedList({ items, email }: { items: SignedItem[]; email: string }) {
  const waiting = items.filter((i) => i.group === "waiting")
  const rest = items.filter((i) => i.group !== "waiting")

  if (items.length === 0) {
    return (
      <section className="rounded-2xl border bg-card">
        <EmptyState
          className="md:py-12"
          icon={<PenLineIcon aria-hidden />}
          title="Nothing signed yet"
          description={`Documents sent to ${email} by any company using Sahihi appear here.`}
        />
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {waiting.length > 0 && (
        <section aria-labelledby="waiting-heading" className="flex flex-col gap-3">
          <h2 id="waiting-heading" className="font-medium text-base">
            Waiting for you
          </h2>
          <ul className="divide-y rounded-2xl border bg-card">
            {waiting.map((i) => (
              <li key={i.recipientId} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <PenLineIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium text-sm">{i.title}</span>
                  <span className="truncate text-muted-foreground text-xs">
                    From {i.sender} · {i.workspace}
                    {i.sentAt ? ` · sent ${formatDate(i.sentAt)}` : ""}
                  </span>
                </div>
                {i.canRequestLink ? (
                  <RequestLinkButton item={i} primary />
                ) : (
                  <span className="text-muted-foreground text-sm">
                    You&apos;ll get an email when it&apos;s your turn
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {rest.length > 0 && (
        <section aria-labelledby="signed-heading" className="flex flex-col gap-3">
          <h2 id="signed-heading" className="font-medium text-base">
            Signed by you
          </h2>
          <ul className="divide-y rounded-2xl border bg-card">
            {rest.map((i) => {
              const status = statusOf(i)
              return (
                <li key={i.recipientId} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-sm">{i.title}</span>
                    <span className="truncate text-muted-foreground text-xs">
                      {i.workspace}
                      {i.signedAt ? ` · you signed ${formatDate(i.signedAt)}` : ""}
                    </span>
                  </div>
                  <Badge tone={status.tone} size="sm">
                    {status.label}
                  </Badge>
                  <div className="flex w-36 justify-end">
                    {i.canDownload ? (
                      <DownloadButton item={i} />
                    ) : i.certificateCode ? (
                      <Link
                        href={`/verify/${i.certificateCode}`}
                        className="flex items-center gap-1.5 text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
                      >
                        <ShieldCheckIcon aria-hidden className="size-4" />
                        Verify
                      </Link>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <p className="rounded-xl bg-muted/60 px-4 py-3 text-muted-foreground text-sm">
        Documents sent to {email} appear here automatically. When a company deletes an envelope
        under its retention policy, it leaves this list too; a copy you downloaded still verifies
        with its certificate.
      </p>
    </div>
  )
}
