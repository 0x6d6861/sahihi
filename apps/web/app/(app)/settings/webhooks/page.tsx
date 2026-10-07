import { redirect } from "next/navigation"

/** Webhooks moved into Settings → API. Keeps old links working. */
export default function WebhooksPage() {
  redirect("/settings/api#webhooks")
}
