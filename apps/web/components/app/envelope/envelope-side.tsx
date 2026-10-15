import type { RecipientStatus } from "@sahihi/core"
import { Badge } from "@/components/app/badge"
import { Person } from "@/components/app/people"
import { Avatar } from "@/components/arc/avatar/avatar"
import { RECIPIENT_STATUS_BADGE } from "@/lib/constants"
import { formatDate, formatDateTime } from "@/lib/format"
import { ROLE_LABELS } from "@/lib/recipients"

interface SideRecipient {
  id: string
  name: string
  email: string
  role: keyof typeof ROLE_LABELS
  status: RecipientStatus
  signedAt: string | null
}

/**
 * The envelope page's side column from `lg` (the redesign): who it's for and where each stands,
 * then the envelope's facts. The Recipients tab keeps the full table and the per-recipient actions.
 */
export function EnvelopeSide({
  recipients,
  createdBy,
  sentAt,
  completedAt,
  sequential,
  expiresAt,
}: {
  recipients: SideRecipient[]
  createdBy: { name: string; image: string | null }
  sentAt: string | null
  completedAt: string | null
  sequential: boolean
  expiresAt: string | null
}) {
  const facts: [string, React.ReactNode][] = [
    ["Created by", <Person key="by" person={createdBy} />],
    ["Sent", sentAt ? formatDateTime(sentAt) : "Not yet"],
    ...(completedAt ? [["Completed", formatDateTime(completedAt)] as [string, string]] : []),
    ["Signing", sequential ? "In order" : "In parallel"],
    ["Expires", expiresAt ? formatDateTime(expiresAt) : "Never"],
  ]
  return (
    <aside className="flex flex-col gap-5 max-lg:hidden">
      <section aria-labelledby="side-recipients" className="rounded-2xl border bg-card">
        <h2 id="side-recipients" className="px-4 pt-3 pb-1 font-medium text-sm">
          Recipients
        </h2>
        <ul className="divide-y">
          {recipients.map((r) => {
            const badge = RECIPIENT_STATUS_BADGE[r.status]
            return (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={r.name} size="sm" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium text-sm">{r.name}</span>
                  <span className="truncate text-muted-foreground text-xs">
                    {ROLE_LABELS[r.role]}
                    {r.signedAt ? ` · Signed ${formatDate(r.signedAt)}` : ` · ${r.email}`}
                  </span>
                </div>
                <Badge tone={badge.tone} size="sm">
                  {badge.label}
                </Badge>
              </li>
            )
          })}
        </ul>
      </section>
      <dl className="flex flex-col gap-2.5 rounded-2xl border bg-card p-4 text-sm">
        {facts.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 truncate text-end">{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}
