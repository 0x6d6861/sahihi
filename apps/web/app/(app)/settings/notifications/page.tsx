import { NotificationPreferencesForm } from "@/components/app/notifications/notification-preferences"
import { Alert } from "@/components/arc/alert/alert"
import { apiServer } from "@/lib/api-server"
import type { NotificationPreference } from "@/lib/notifications"

export const metadata = { title: "Notifications" }

/**
 * What the bell in the top bar tells you about, in this workspace (docs/notifications.md). Emails
 * to recipients and the completed/declined emails aren't affected.
 */
export default async function NotificationsSettingsPage() {
  const { data } = await apiServer<{ items: NotificationPreference[] }>(
    "/notifications/preferences",
  )
  if (!data) {
    return (
      <Alert tone="danger" title="Couldn't load your notification settings">
        Reload the page to try again.
      </Alert>
    )
  }
  return <NotificationPreferencesForm initial={data.items} />
}
