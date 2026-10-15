"use client"

import { invitableRoles, type OrgRole } from "@sahihi/core"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useRef, useState } from "react"
import { AuthForm } from "@/components/app/auth/auth-form"
import { AuthShell } from "@/components/app/auth/auth-shell"
import { BrandPanel } from "@/components/app/auth/brand-panel"
import { Button } from "@/components/app/button"
import { Input } from "@/components/app/fields"
import { ImageUpIcon } from "@/components/app/icons"
import {
  type InviteRow,
  InviteRows,
  newInviteRow,
  sendInvites,
} from "@/components/app/members/invite-rows"
import {
  AssistantAside,
  RecipientPreview,
  RolesAside,
} from "@/components/app/onboarding/onboarding-asides"
import {
  LOGO_ACCEPTED,
  LOGO_MAX_SOURCE_BYTES,
  toLogoPng,
} from "@/components/app/workspace/workspace-logo"
import { Alert } from "@/components/arc/alert/alert"
import { RadioGroup } from "@/components/arc/radio-group/radio-group"
import { api } from "@/lib/api"
import { organization } from "@/lib/auth-client"
import { HOME_HREF } from "@/lib/nav"
import { cn } from "@/lib/utils"

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)

type Step = "workspace" | "team" | "assistant"
const STEP_LABELS: Record<Step, string> = {
  workspace: "Workspace",
  team: "Team",
  assistant: "AI assistant",
}

interface Seats {
  plan: string
  limit: number | null
  used: number
  assistantTurns: number | null
}

/** The steps across the top: done and current ones filled. */
function Stepper({ steps, current }: { steps: Step[]; current: Step }) {
  const at = steps.indexOf(current)
  return (
    <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
      {steps.map((s, i) => (
        <li
          key={s}
          aria-current={s === current ? "step" : undefined}
          className="flex flex-col gap-2 text-xs"
        >
          <span className={cn("h-1 rounded-full", i <= at ? "bg-primary" : "bg-muted")} />
          <span className={i <= at ? "text-foreground" : "text-muted-foreground"}>
            {STEP_LABELS[s]}
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * First run (ADR 0061): name the workspace (and an optional logo), invite the team, then, where the
 * server has a model and the person may switch it on, choose whether to use the AI assistant. Only
 * the first step is required; the others have "Skip for now". Someone who arrives from a signing
 * link (`from=signing`, ADR 0062) may leave without a workspace.
 */
function Onboarding() {
  const router = useRouter()
  const fromSigning = useSearchParams().get("from") === "signing"
  // Someone who has been sent documents may look at them before (or without) a workspace.
  const [hasSigned, setHasSigned] = useState(false)
  useEffect(() => {
    api<{ items: unknown[] }>("/me/envelopes")
      .then((r) => setHasSigned(r.items.length > 0))
      .catch(() => {})
  }, [])
  const [step, setStep] = useState<Step>("workspace")
  const [steps, setSteps] = useState<Step[]>(["workspace", "team", "assistant"])
  const [name, setName] = useState("")
  const [logo, setLogo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [seats, setSeats] = useState<Seats | null>(null)
  const [roles, setRoles] = useState<OrgRole[]>(["admin", "member"])
  const [rows, setRows] = useState<InviteRow[]>([newInviteRow()])
  const [assistant, setAssistant] = useState<"on" | "off">("on")

  const finish = () => {
    router.push(HOME_HREF)
    router.refresh()
  }

  async function pickLogo(file: File | undefined) {
    setError(null)
    if (!file) return
    if (!LOGO_ACCEPTED.includes(file.type)) return setError("Use a PNG, JPG or WebP image.")
    if (file.size > LOGO_MAX_SOURCE_BYTES) return setError("Use an image under 5 MB.")
    try {
      setLogo(await toLogoPng(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the image")
    }
  }

  async function createWorkspace(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const suffix = Math.random().toString(36).slice(2, 6)
    const { data, error } = await organization.create({ name, slug: `${slugify(name)}-${suffix}` })
    if (error || !data) {
      setPending(false)
      return setError(error?.message ?? "Could not create workspace")
    }
    await organization.setActive({ organizationId: data.id })
    // The logo is optional: a failed upload doesn't stop setup (it can be added in Settings).
    if (logo) {
      await api("/workspace/logo", { method: "PUT", json: { dataUrl: logo } }).catch(() => {})
    }
    const [billing, ai, member] = await Promise.all([
      api<{
        plan: { name: string; assistantTurnsPerMonth: number | null }
        seats: { used: number; limit: number | null }
      }>("/billing").catch(() => null),
      api<{ configured: boolean; canManage: boolean }>("/generated-documents/settings").catch(
        () => null,
      ),
      organization.getActiveMemberRole().catch(() => null),
    ])
    if (billing) {
      setSeats({
        plan: billing.plan.name,
        limit: billing.seats.limit,
        used: billing.seats.used,
        assistantTurns: billing.plan.assistantTurnsPerMonth,
      })
    }
    const role = member?.data?.role
    if (role) setRoles(invitableRoles(role))
    // Only ask about the assistant where it exists and this person may switch it on.
    if (!ai?.configured || !ai.canManage) setSteps(["workspace", "team"])
    setPending(false)
    setStep("team")
  }

  const seatsLeft = seats?.limit == null ? null : Math.max(0, seats.limit - seats.used)
  const lastStep = steps.at(-1)

  async function invite() {
    setPending(true)
    setError(null)
    const result = await sendInvites(rows)
    setRows(result.rows)
    setPending(false)
    if (result.rows.some((r) => r.error)) return
    if (lastStep === "team") return finish()
    setStep("assistant")
  }

  async function chooseAssistant() {
    setPending(true)
    setError(null)
    try {
      if (assistant === "on") {
        await api("/generated-documents/settings", { method: "PUT", json: { enabled: true } })
      }
      finish()
    } catch {
      setPending(false)
      setError("Could not turn on the assistant. You can do it later from Drafting.")
    }
  }

  const skip = () => (step === lastStep ? finish() : setStep("assistant"))

  const aside =
    step === "workspace" ? (
      name || logo ? (
        <RecipientPreview name={name} logo={logo} />
      ) : (
        <BrandPanel />
      )
    ) : step === "team" ? (
      <RolesAside />
    ) : (
      <AssistantAside />
    )

  return (
    <AuthShell aside={aside}>
      <div className="flex w-full max-w-sm flex-col gap-8">
        <Stepper steps={steps} current={step} />

        {step === "workspace" && (
          <AuthForm
            title="Set up your workspace"
            description="Everything your team sends lives here."
          >
            <form className="flex flex-col gap-5" onSubmit={createWorkspace}>
              {error && <Alert tone="danger" title={error} />}
              <Input
                label="Workspace name"
                name="name"
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                description="Usually your company or team name. Recipients see it in signing emails and on the signing page."
              />
              <div className="flex flex-col gap-2">
                <span className="flex items-center justify-between text-sm">
                  <span className="font-medium">Logo</span>
                  <span className="text-muted-foreground">Optional</span>
                </span>
                <div className="flex items-center gap-3 rounded-xl border p-2.5">
                  <span className="on-paper grid h-10 w-20 shrink-0 place-items-center rounded-lg bg-background">
                    {logo ? (
                      // biome-ignore lint/performance/noImgElement: a local data URL the person just picked
                      <img src={logo} alt="" className="max-h-8 max-w-18 object-contain" />
                    ) : (
                      <ImageUpIcon aria-hidden className="size-4 text-muted-foreground" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 text-muted-foreground text-xs">
                    PNG, JPG or WebP
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                  >
                    {logo ? "Change" : "Upload"}
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    hidden
                    accept={LOGO_ACCEPTED.join(",")}
                    onChange={(e) => void pickLogo(e.target.files?.[0])}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" loading={pending}>
                Create workspace
              </Button>
              {(fromSigning || hasSigned) && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => router.push("/signed")}
                >
                  Not now, show my signed documents
                </Button>
              )}
            </form>
          </AuthForm>
        )}

        {step === "team" && (
          <AuthForm
            title="Invite your team"
            description="They get an email with a link to join. The link works for 48 hours."
          >
            <div className="flex flex-col gap-5">
              {roles.length === 0 ? (
                <Alert tone="info" title="Only owners and admins can invite people" />
              ) : seatsLeft === 0 ? (
                <Alert tone="info" title="No seats left">
                  Your {seats?.plan} plan&apos;s seats are all in use. Upgrade under Settings, Plan
                  &amp; usage.
                </Alert>
              ) : (
                <InviteRows rows={rows} roles={roles} maxRows={seatsLeft} onChange={setRows} />
              )}
              {seats?.limit != null && (
                <p className="text-muted-foreground text-sm">
                  Your {seats.plan} plan includes {seats.limit} seats, and you use {seats.used}. A
                  pending invitation holds a seat.
                </p>
              )}
              <div className="flex flex-col gap-2">
                <Button
                  className="w-full"
                  loading={pending}
                  disabled={!rows.some((r) => r.email.trim() && !r.sent) || seatsLeft === 0}
                  onClick={invite}
                >
                  Send invitations
                </Button>
                <Button variant="ghost" className="w-full" disabled={pending} onClick={skip}>
                  Skip for now
                </Button>
              </div>
            </div>
          </AuthForm>
        )}

        {step === "assistant" && (
          <AuthForm
            title="Draft documents with AI?"
            description="The assistant drafts from reviewed starters and asks before filling anything in. Document text is sent to the AI provider, so it's off until you turn it on."
          >
            <div className="flex flex-col gap-5">
              {error && <Alert tone="danger" title={error} />}
              <RadioGroup
                label="AI assistant"
                value={assistant}
                onValueChange={(v) => setAssistant(v === "off" ? "off" : "on")}
                options={[
                  {
                    value: "on",
                    label: "Turn it on",
                    description:
                      seats?.assistantTurns != null
                        ? `Everyone in the workspace can draft with it. Your ${seats.plan} plan includes ${seats.assistantTurns} assistant replies a month.`
                        : "Everyone in the workspace can draft with it.",
                  },
                  {
                    value: "off",
                    label: "Not now",
                    description:
                      "Turn it on later from Drafting. Uploading PDFs and sending works either way.",
                  },
                ]}
              />
              <Button className="w-full" loading={pending} onClick={chooseAssistant}>
                Finish setup
              </Button>
            </div>
          </AuthForm>
        )}
      </div>
    </AuthShell>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <Onboarding />
    </Suspense>
  )
}
