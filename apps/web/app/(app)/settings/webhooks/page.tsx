import { WebhookIcon } from "lucide-react"
import { AddWebhookButton } from "@/components/app/webhooks/add-webhook-button"
import { EndpointCard, type WebhookEndpointRow } from "@/components/app/webhooks/endpoint-card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardPanel } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { apiServer } from "@/lib/api-server"

export const metadata = { title: "Webhooks" }

/** Webhook endpoints of the active workspace (docs/webhooks.md). Owners and admins only. */
export default async function WebhooksPage() {
  const { status, data } = await apiServer<{ items: WebhookEndpointRow[] }>("/webhooks")
  if (status === 403) {
    return (
      <Alert variant="info">
        <AlertTitle>Owners and admins only</AlertTitle>
        <AlertDescription>
          Webhooks send this workspace's envelope data to other systems, so only owners and admins
          can set them up.
        </AlertDescription>
      </Alert>
    )
  }
  const items = data?.items ?? []
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-lg">Webhooks</h2>
          <p className="text-muted-foreground text-sm">
            Get signed HTTPS callbacks when envelopes are sent, signed, completed, declined, voided
            or expire. Failed deliveries are retried for about two days.
          </p>
        </div>
        <AddWebhookButton />
      </div>
      {items.length === 0 ? (
        <Card>
          <CardPanel>
            <Empty className="md:py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <WebhookIcon aria-hidden />
                </EmptyMedia>
                <EmptyTitle>No webhooks yet</EmptyTitle>
                <EmptyDescription>
                  Add an endpoint to sync completed agreements into your ERP, CRM or storage.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardPanel>
        </Card>
      ) : (
        items.map((endpoint) => <EndpointCard key={endpoint.id} endpoint={endpoint} />)
      )}
    </div>
  )
}
