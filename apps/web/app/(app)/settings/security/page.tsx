import { redirect } from "next/navigation"
import { ChangePasswordForm } from "@/components/app/account/change-password-form"
import { type SessionRow, SessionsList } from "@/components/app/account/sessions-list"
import { TwoFactorSettings } from "@/components/app/account/two-factor-settings"
import { Panel } from "@/components/app/panel"
import { apiServer, getServerSession } from "@/lib/api-server"

export const metadata = { title: "Security" }

/** Password, two-factor authentication and sessions (docs/auth.md → Account settings). */
export default async function SecurityPage() {
  const [session, sessions] = await Promise.all([
    getServerSession(),
    apiServer<SessionRow[]>("/auth/list-sessions"),
  ])
  if (!session) redirect("/sign-in")

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Password">
        <ChangePasswordForm />
      </Panel>

      <Panel
        title="Two-factor authentication"
        description="A second step at sign-in, so a stolen password isn't enough."
      >
        <TwoFactorSettings
          enabled={Boolean(session.user.twoFactorEnabled)}
          email={session.user.email}
        />
      </Panel>

      <Panel title="Sessions" description="Devices where you're signed in to Sahihi.">
        <SessionsList sessions={sessions.data ?? []} currentId={session.session.id} />
      </Panel>
    </div>
  )
}
