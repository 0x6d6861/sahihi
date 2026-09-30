import type { Plan, UsageLevel } from "@sahihi/core"
import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card"
import { Meter, MeterIndicator, MeterLabel, MeterTrack } from "@/components/ui/meter"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { apiServer } from "@/lib/api-server"
import { limitLabel, usageLabel } from "@/lib/billing"

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
  plans: Plan[]
}

export const metadata = { title: "Plan & usage" }

const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "Africa/Nairobi",
})

/** Current plan and this month's usage (docs/billing.md). Plans are changed by the Sahihi team. */
export default async function BillingPage() {
  const { data } = await apiServer<BillingResponse>("/billing")
  if (!data) {
    return <p className="text-muted-foreground text-sm">Plan details could not be loaded.</p>
  }
  // Periods end at 00:00 on the 1st (Nairobi); show the day sending resets.
  const resetsOn = day.format(new Date(data.period.end))

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{data.plan.name} plan</CardTitle>
            <Badge variant="secondary">Current</Badge>
          </div>
          <CardDescription>{data.plan.description}</CardDescription>
        </CardHeader>
        <CardPanel className="grid gap-6 sm:grid-cols-2">
          <UsageMeter
            label="Envelopes sent this month"
            used={data.envelopes.used}
            limit={data.envelopes.limit}
            level={data.envelopes.level}
            hint={`Resets on ${resetsOn}. Drafts and signing don't count; each sent envelope does.`}
          />
          <UsageMeter
            label="Seats"
            used={data.seats.used}
            limit={data.seats.limit}
            level={data.seats.level}
            hint={`${data.seats.members} ${data.seats.members === 1 ? "member" : "members"}, ${data.seats.pendingInvitations} pending ${data.seats.pendingInvitations === 1 ? "invitation" : "invitations"}.`}
          />
        </CardPanel>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plans</CardTitle>
          <CardDescription>
            Plan changes are handled by the Sahihi team for now. Online payment is coming.
          </CardDescription>
        </CardHeader>
        <CardPanel>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Envelopes a month</TableHead>
                <TableHead>Seats</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.plans.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      {p.name}
                      {p.id === data.plan.id && <Badge variant="outline">Current</Badge>}
                    </div>
                    <div className="text-muted-foreground text-xs">{p.description}</div>
                  </TableCell>
                  <TableCell>{limitLabel(p.envelopesPerMonth, "envelopes")}</TableCell>
                  <TableCell>{limitLabel(p.seats, "seats")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardPanel>
      </Card>
    </div>
  )
}

function UsageMeter({
  label,
  used,
  limit,
  level,
  hint,
}: {
  label: string
  used: number
  limit: number | null
  level: UsageLevel
  hint: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <Meter value={limit === null ? 0 : Math.min(used, limit)} max={limit ?? 1}>
        <div className="flex items-center justify-between gap-2">
          <MeterLabel>{label}</MeterLabel>
          <span className="text-foreground text-sm tabular-nums">{usageLabel(used, limit)}</span>
        </div>
        <MeterTrack>
          <MeterIndicator
            className={
              level === "exceeded"
                ? "bg-destructive"
                : level === "warning"
                  ? "bg-warning"
                  : undefined
            }
          />
        </MeterTrack>
      </Meter>
      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  )
}
