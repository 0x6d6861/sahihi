import { getAuthenticatorName } from "@better-auth/passkey"
import { redirect } from "next/navigation"
import { ChangePasswordForm } from "@/components/app/account/change-password-form"
import { DeleteAccount, type DeletionBlocker } from "@/components/app/account/delete-account"
import { type PasskeyRow, PasskeySettings } from "@/components/app/account/passkey-settings"
import { type SessionRow, SessionsList } from "@/components/app/account/sessions-list"
import { TwoFactorSettings } from "@/components/app/account/two-factor-settings"
import { Panel } from "@/components/app/panel"
import { apiServer, getServerSession } from "@/lib/api-server"

export const metadata = { title: "Security" }

/** `GET /api/auth/passkey/list-user-passkeys` (better-auth, `@better-auth/passkey`). */
interface StoredPasskey {
  id: string
  name?: string | null
  aaguid?: string | null
  backedUp: boolean
  createdAt?: string | null
}

const toRow = (p: StoredPasskey): PasskeyRow => ({
  id: p.id,
  label: p.name || getAuthenticatorName(p.aaguid ?? undefined) || "Passkey",
  synced: p.backedUp,
  createdAt: p.createdAt ?? null,
})

/** Password, passkeys, two-factor authentication, sessions and deleting the account (docs/auth.md → Account settings). */
export default async function SecurityPage() {
  const [session, sessions, passkeys, deletion] = await Promise.all([
    getServerSession(),
    apiServer<SessionRow[]>("/auth/list-sessions"),
    apiServer<StoredPasskey[]>("/auth/passkey/list-user-passkeys"),
    apiServer<{ blockers: DeletionBlocker[] }>("/me/deletion"),
  ])
  if (!session) redirect("/sign-in")

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Password">
        <ChangePasswordForm />
      </Panel>

      <Panel
        title="Passkeys"
        description="Sign in with your fingerprint, face or screen lock instead of a password. Passkeys can't be phished."
      >
        <PasskeySettings passkeys={(passkeys.data ?? []).map(toRow)} />
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

      <Panel
        className="border-destructive/30"
        title="Delete account"
        description="Erases your name, email, sign-in methods, picture and saved signatures, and removes you from every workspace. Documents and envelopes you created stay with their workspaces, shown as by “Deleted user”. This can't be undone."
      >
        <DeleteAccount blockers={deletion.data?.blockers ?? []} />
      </Panel>
    </div>
  )
}
