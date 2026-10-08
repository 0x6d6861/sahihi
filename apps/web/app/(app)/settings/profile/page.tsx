import { redirect } from "next/navigation"
import { ChangeEmail } from "@/components/app/account/change-email"
import { ProfileForm } from "@/components/app/account/profile-form"
import { ProfilePicture } from "@/components/app/account/profile-picture"
import {
  type SavedSignatures,
  SavedSignaturesEditor,
} from "@/components/app/account/saved-signatures"
import { Panel } from "@/components/app/panel"
import { apiServer, getServerSession } from "@/lib/api-server"

export const metadata = { title: "Profile" }

/** Your picture, name, email and saved signature (docs/auth.md → Account settings). Any signed-in user. */
export default async function ProfilePage() {
  const [session, signatures] = await Promise.all([
    getServerSession(),
    apiServer<SavedSignatures>("/me/signatures"),
  ])
  if (!session) redirect("/sign-in")
  const { user } = session

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Profile">
        <ProfilePicture name={user.name} email={user.email} image={user.image ?? null} />
        <ProfileForm name={user.name} />
      </Panel>

      <Panel
        title="Email"
        description="Where you sign in and receive notifications about envelopes you send."
      >
        <ChangeEmail email={user.email} verified={user.emailVerified} />
      </Panel>

      <Panel
        title="Signature"
        description={`Save your signature and initials once. When a document is sent to ${user.email} and you're signed in, you can place them with one click.`}
      >
        <SavedSignaturesEditor
          name={user.name}
          initial={signatures.data ?? { signature: null, initials: null }}
        />
      </Panel>
    </div>
  )
}
