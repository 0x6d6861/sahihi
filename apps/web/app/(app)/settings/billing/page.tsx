import type { Plan, UsageLevel } from "@sahihi/core"
import { Panel } from "@/components/app/panel"
import { Badge } from "@/components/arc/badge/badge"
import { MetricCard } from "@/components/arc/metric-card/metric-card"
import { UsageMeter } from "@/components/arc/usage-meter/usage-meter"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { apiServer } from "@/lib/api-server"
import { limitLabel } from "@/lib/billing"
import { formatDayMonth } from "@/lib/format"

interface BillingResponse {
  plan: Plan
  period: { start: string; end: string }
  envelopes: { used: number; limit: number | null; level: UsageLevel }
  seats: {
    members: number
    pendingInvitations: number
    used: number
    limit: number | null
    level: UsageLevel
  }
  assistant: { used: number; limit: number | null; level: UsageLevel }
  plans: Plan[]
}

export const metadata = { title: "Plan & usage" }

/** Current plan and this month's usage (docs/billing.md). Plans are changed by the Sahihi team. */
export default async function BillingPage() {
  const { data } = await apiServer<BillingResponse>("/billing")
  if (!data) {
    return <p className="text-muted-foreground text-sm">Plan details could not be loaded.</p>
  }
  // Periods end at 00:00 on the 1st (Nairobi); show the day sending resets.
  const resetsOn = formatDayMonth(new Date(data.period.end))

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title={
          <span className="flex flex-wrap items-center gap-2">
            {data.plan.name} plan <Badge size="sm">Current</Badge>
          </span>
        }
        description={data.plan.description}
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <Allowance
            label="Envelopes sent this month"
            unit="envelopes"
            limit={data.envelopes.limit}
            segments={[{ id: "sent", label: "Sent", value: data.envelopes.used }]}
            hint={`Resets on ${resetsOn}. Drafts and signing don't count; each sent envelope does.`}
          />
          <Allowance
            label="Seats"
            unit="seats"
            limit={data.seats.limit}
            segments={[
              { id: "members", label: "Members", value: data.seats.members },
              {
                id: "invitations",
                label: "Pending invitations",
                value: data.seats.pendingInvitations,
              },
            ]}
            hint={`${data.seats.members} ${data.seats.members === 1 ? "member" : "members"}, ${data.seats.pendingInvitations} pending ${data.seats.pendingInvitations === 1 ? "invitation" : "invitations"}.`}
          />
          <Allowance
            label="AI assistant replies this month"
            unit="replies"
            limit={data.assistant.limit}
            segments={[{ id: "replies", label: "Replies", value: data.assistant.used }]}
            hint={`Resets on ${resetsOn}. Each reply of the assistant in Draft with AI counts; editing and finalising don't.`}
          />
        </div>
      </Panel>

      <Panel
        title="Plans"
        description="Plan changes are handled by the Sahihi team for now. Online payment is coming."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plan</TableHead>
              <TableHead>Envelopes a month</TableHead>
              <TableHead>Seats</TableHead>
              <TableHead>AI replies a month</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.plans.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="flex items-center gap-2 font-medium">
                    {p.name}
                    {p.id === data.plan.id && (
                      <Badge size="sm" tone="info">
                        Current
                      </Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground text-xs">{p.description}</div>
                </TableCell>
                <TableCell>{limitLabel(p.envelopesPerMonth, "envelopes")}</TableCell>
                <TableCell>{limitLabel(p.seats, "seats")}</TableCell>
                <TableCell>{limitLabel(p.assistantTurnsPerMonth, "replies")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  )
}

/** A metered allowance: Arc's usage meter against the plan limit, or a plain count when unlimited. */
function Allowance({
  label,
  unit,
  limit,
  segments,
  hint,
}: {
  label: string
  unit: string
  limit: number | null
  segments: { id: string; label: string; value: number }[]
  hint: string
}) {
  const used = segments.reduce((sum, s) => sum + s.value, 0)
  return (
    <div className="flex flex-col gap-2">
      {limit === null ? (
        <MetricCard label={label} value={used} context={`Unlimited ${unit} on this plan`} />
      ) : (
        <UsageMeter label={label} segments={segments} limit={limit} unit="" decimals={0} />
      )}
      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  )
}
