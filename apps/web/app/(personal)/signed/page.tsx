import { type SignedItem, SignedList } from "@/components/app/signed/signed-list"
import { Alert } from "@/components/arc/alert/alert"
import { apiServer, getServerSession } from "@/lib/api-server"
import { pluralize } from "@/lib/format"

export const metadata = { title: "Signed documents" }

/**
 * Optional signer accounts (ADR 0062): every envelope sent to the person's verified email, from any
 * workspace. Works without a workspace of their own.
 */
export default async function SignedPage() {
  const [session, { data }] = await Promise.all([
    getServerSession(),
    apiServer<{ verified: boolean; items: SignedItem[] }>("/me/envelopes"),
  ])
  const email = session?.user.email ?? ""
  const items = data?.items ?? []
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="font-medium text-2xl tracking-tight">Signed documents</h1>
        <p className="text-muted-foreground text-sm tabular-nums">
          {pluralize(items.length, "document")}
        </p>
      </header>
      {data && !data.verified ? (
        <Alert tone="info" title="Confirm your email to see your documents">
          We sent a link to {email}. Documents sent to that address appear here once you confirm it.
        </Alert>
      ) : (
        <SignedList items={items} email={email} />
      )}
    </div>
  )
}
