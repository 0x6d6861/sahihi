import { type ApiKeyRow, ApiKeysPanel } from "@/components/app/developer/api-keys-panel"
import { EmbedOriginsForm } from "@/components/app/developer/embed-origins-form"
import { WebhookIcon } from "@/components/app/icons"
import { Panel } from "@/components/app/panel"
import { AddWebhookButton } from "@/components/app/webhooks/add-webhook-button"
import { EndpointCard, type WebhookEndpointRow } from "@/components/app/webhooks/endpoint-card"
import { Alert } from "@/components/arc/alert/alert"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import { apiServer } from "@/lib/api-server"

export const metadata = { title: "API" }

/**
 * API keys, embedded signing origins and webhooks (docs/public-api.md,
 * docs/embedded-signing.md, docs/webhooks.md). Owners and admins only.
 */
export default async function ApiSettingsPage() {
  const [keys, embedding, webhooks] = await Promise.all([
    apiServer<{ items: ApiKeyRow[] }>("/api-keys"),
    apiServer<{ origins: string[] }>("/embedding"),
    apiServer<{ items: WebhookEndpointRow[] }>("/webhooks"),
  ])
  if (keys.status === 403) {
    return (
      <Alert tone="info" title="Owners and admins only">
        API keys and webhooks give other systems access to this workspace, so only owners and admins
        can manage them.
      </Alert>
    )
  }
  const endpoints = webhooks.data?.items ?? []
  return (
    <div className="flex flex-col gap-6">
      <Panel
        title="API keys"
        description={
          <>
            Call the Sahihi API from your own systems: upload documents, create and send envelopes,
            bulk send and embedded signing. Send the key as{" "}
            <span className="font-mono">Authorization: Bearer sahihi_sk_…</span> to{" "}
            <span className="font-mono">/api/v1</span>.
          </>
        }
      >
        <ApiKeysPanel keys={keys.data?.items ?? []} />
      </Panel>
      <Panel
        title="Embedded signing"
        description="Let recipients sign inside your own site. Request a signing URL with the API and show it in an iframe; the page posts sahihi:ready, sahihi:signed and sahihi:declined to your window."
      >
        <EmbedOriginsForm initial={embedding.data?.origins ?? []} />
      </Panel>
      <section id="webhooks" className="flex scroll-mt-6 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-medium text-lg">Webhooks</h2>
            <p className="text-muted-foreground text-sm">
              Get signed HTTPS callbacks when envelopes are sent, signed, completed, declined,
              voided or expire. Failed deliveries are retried for about two days.
            </p>
          </div>
          <AddWebhookButton />
        </div>
        {endpoints.length === 0 ? (
          <Panel>
            <EmptyState
              className="md:py-10"
              icon={<WebhookIcon aria-hidden />}
              title="No webhooks yet"
              description="Add an endpoint to sync completed agreements into your ERP, CRM or storage."
            />
          </Panel>
        ) : (
          endpoints.map((endpoint) => <EndpointCard key={endpoint.id} endpoint={endpoint} />)
        )}
      </section>
    </div>
  )
}
