import { AuthAside } from "@/components/app/auth/auth-shell"
import { CheckIcon } from "@/components/app/icons"
import { MEMBER_ROLE_LABELS } from "@/lib/members"

/** Step 1: how the workspace name and logo show up for recipients (a signing email). */
export function RecipientPreview({ name, logo }: { name: string; logo: string | null }) {
  return (
    <AuthAside className="justify-center">
      <h2 className="font-medium text-lg">What recipients see</h2>
      <div aria-hidden className="flex flex-col gap-4 rounded-2xl bg-card p-6">
        <div className="flex flex-col gap-1">
          <span className="font-medium text-sm">
            Achieng Otieno sent you “Offer letter, Juma Ochieng” to sign
          </span>
          <span className="text-muted-foreground text-xs">From Sahihi</span>
        </div>
        <div className="on-paper flex min-h-12 items-center rounded-lg bg-background px-3 py-2">
          {logo ? (
            // biome-ignore lint/performance/noImgElement: a local data URL the person just picked
            <img src={logo} alt="" className="h-8 w-auto max-w-40 object-contain" />
          ) : (
            <span className="font-medium text-foreground">{name || "Your workspace"}</span>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          Achieng Otieno asked you to review and sign Offer of Employment.pdf.
        </p>
        <span className="self-start rounded-lg bg-primary px-3 py-1.5 text-primary-foreground text-sm">
          Review and sign
        </span>
      </div>
      <p className="text-muted-foreground text-sm">
        The name and logo appear at the top of every signing email and on the signing page.
      </p>
    </AuthAside>
  )
}

const ROLE_HELP = {
  owner: "Everything, including deleting the workspace. You're the owner.",
  admin:
    "Manages members, webhooks, API keys, data and the AI assistant. Edits anyone's envelopes.",
  member: "Uploads, sends and signs. Edits only their own envelopes, documents and folders.",
} as const

/** Step 2: what each role may do. */
export function RolesAside() {
  return (
    <AuthAside className="justify-center">
      <h2 className="font-medium text-lg">Who can do what</h2>
      <dl className="flex flex-col divide-y rounded-2xl bg-card">
        {(Object.keys(ROLE_HELP) as (keyof typeof ROLE_HELP)[]).map((role) => (
          <div key={role} className="flex flex-col gap-1 p-4">
            <dt className="font-medium text-sm">{MEMBER_ROLE_LABELS[role]}</dt>
            <dd className="text-muted-foreground text-sm">{ROLE_HELP[role]}</dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground text-sm">
        Everyone sees every document and envelope in the workspace. Change roles any time under
        Settings, Members.
      </p>
    </AuthAside>
  )
}

const PROMISES = [
  "It asks for missing details instead of inventing them.",
  "Every edit it suggests waits for you to accept it.",
  "Anything you skip stays visibly blank until you fill it in.",
]

/** Step 3: how the assistant behaves. */
export function AssistantAside() {
  return (
    <AuthAside className="justify-center">
      <h2 className="font-medium text-lg">How the assistant works</h2>
      <div
        aria-hidden
        className="flex flex-col gap-3 rounded-2xl border border-info/40 bg-card p-5"
      >
        <span className="font-mono text-muted-foreground text-xs">Question 1 of 3</span>
        <span className="font-medium text-sm">When does the agreement take effect?</span>
        <span className="text-muted-foreground text-xs">Fills: Effective date</span>
        <span className="rounded-lg border bg-background px-3 py-2 text-sm">1 November 2026</span>
      </div>
      <ul className="flex flex-col gap-2.5">
        {PROMISES.map((p) => (
          <li key={p} className="flex items-start gap-2 text-sm">
            <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-success-foreground" />
            {p}
          </li>
        ))}
      </ul>
    </AuthAside>
  )
}
