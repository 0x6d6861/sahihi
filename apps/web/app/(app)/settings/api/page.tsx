import { type ApiKeyRow, ApiKeysPanel } from "@/components/app/developer/api-keys-panel"
import { EmbedOriginsForm } from "@/components/app/developer/embed-origins-form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card"
import { apiServer } from "@/lib/api-server"

export const metadata = { title: "API" }

/** API keys and embedded signing origins (docs/public-api.md, docs/embedded-signing.md). */
export default async function ApiSettingsPage() {
  const [keys, embedding] = await Promise.all([
    apiServer<{ items: ApiKeyRow[] }>("/api-keys"),
    apiServer<{ origins: string[] }>("/embedding"),
  ])
  if (keys.status === 403) {
    return (
      <Alert variant="info">
        <AlertTitle>Owners and admins only</AlertTitle>
        <AlertDescription>
          API keys give other systems access to this workspace, so only owners and admins can manage
          them.
        </AlertDescription>
      </Alert>
    )
  }
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>
            Call the Sahihi API from your own systems: upload documents, create and send envelopes,
            bulk send and embedded signing. Send the key as{" "}
            <span className="font-mono">Authorization: Bearer sahihi_sk_…</span> to{" "}
            <span className="font-mono">/api/v1</span>.
          </CardDescription>
        </CardHeader>
        <CardPanel>
          <ApiKeysPanel keys={keys.data?.items ?? []} />
        </CardPanel>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Embedded signing</CardTitle>
          <CardDescription>
            Let recipients sign inside your own site. Request a signing URL with the API and show it
            in an iframe; the page posts sahihi:ready, sahihi:signed and sahihi:declined to your
            window.
          </CardDescription>
        </CardHeader>
        <CardPanel>
          <EmbedOriginsForm initial={embedding.data?.origins ?? []} />
        </CardPanel>
      </Card>
    </div>
  )
}
