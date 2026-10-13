/**
 * Composed product screens. Each one fills its parent (a ChromeFrame screen
 * or a grey demo panel) and scales via MockupRoot.
 */
import { sample } from "@/content/site"
import {
  AppTopBar,
  AssistantText,
  Avatar,
  Blank,
  Button,
  Card,
  ChatBubble,
  Composer,
  FieldBox,
  HashRow,
  MockupRoot,
  PanelLabel,
  PdfPage,
  QrCode,
  Question,
  RecipientRow,
  SettingRow,
  Signature,
  StatusPill,
  shortHash,
  TextLines,
  toneColor,
  WindowBar,
} from "./parts"

const [first, second] = sample.recipients

/** Field layout on the NDA's signature page, shared by the editor, hero and merged window. */
const signatureFields = [
  { tone: 0, label: "Signature", at: [8, 62, 36, 8], filled: "signature" },
  { tone: 0, label: "Date signed", at: [8, 73, 28, 4.5], filled: "14 Oct 2026" },
  { tone: 1, label: "Signature", at: [56, 62, 36, 8], filled: "signature" },
  { tone: 1, label: "Date signed", at: [56, 73, 28, 4.5], filled: "14 Oct 2026" },
] as const

function SignaturePage({ filled = true, selected }: { filled?: boolean; selected?: number }) {
  return (
    <PdfPage heading={false}>
      <p className="text-[0.55em] font-semibold">5. {sample.sections[4]}</p>
      <TextLines widths={[100, 94, 98, 60]} className="mt-[0.8em]" />
      <TextLines widths={[100, 97, 91, 40]} className="mt-[0.9em]" />
      <p className="mt-[1.4em] text-[0.5em] opacity-60">
        Signed by the parties on the dates below.
      </p>
      <p className="absolute left-[8%] top-[56%] text-[0.5em] opacity-60">{sample.parties[0]}</p>
      <p className="absolute left-[56%] top-[56%] text-[0.5em] opacity-60">{sample.parties[1]}</p>
      {signatureFields.map((f, i) => (
        <FieldBox
          key={`${f.tone}-${f.label}`}
          tone={f.tone}
          label={f.label}
          at={[...f.at]}
          filled={filled ? f.filled : undefined}
          selected={selected === i}
        />
      ))}
    </PdfPage>
  )
}

/** The drafted document as the editor shows it: numbered sections with blanks. */
function DraftDoc({
  sections = 3,
  filled = true,
  signatures = false,
}: {
  sections?: number
  filled?: boolean
  signatures?: boolean
}) {
  const b = sample.blanks
  return (
    <div className="flex flex-col gap-[0.9em] bg-(--mk-paper) p-[2em] text-[0.8em] leading-[1.6] text-(--mk-paper-ink) shadow-[0_0.2em_0.8em_rgb(0_0_0/0.1)]">
      <p className="text-[1.25em] font-semibold tracking-[-0.01em]">
        Mutual Non-Disclosure Agreement
      </p>
      <p className="text-(--mk-paper-text)">
        This Agreement is made on <Blank filled={filled}>{b.effectiveDate}</Blank> between{" "}
        <Blank>{sample.parties[0]}</Blank> and <Blank>{sample.parties[1]}</Blank> for the purpose of{" "}
        <Blank filled={filled}>{b.purpose}</Blank>.
      </p>
      {sample.sections.slice(0, sections).map((s, i) => (
        <div key={s}>
          <p className="font-semibold">
            {i + 1}. {s}
          </p>
          {i === 2 ? (
            <p className="text-(--mk-paper-text)">
              The receiving party keeps the information confidential for{" "}
              <Blank filled={filled}>{b.term}</Blank> after disclosure.
            </p>
          ) : (
            <TextLines widths={[100, 92, 64]} className="mt-[0.5em]" />
          )}
        </div>
      ))}
      {signatures && (
        <div className="mt-[0.6em] grid grid-cols-2 gap-[2em]">
          {sample.parties.map((p, i) => (
            <div key={p}>
              <div
                className="h-[2.2em] rounded-[0.25em] border border-dashed"
                style={{ borderColor: toneColor(i) }}
              />
              <p className="mt-[0.3em] text-[0.85em] text-(--mk-paper-text)">For {p}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Hero / scroll story ───────────────────────────────────────── */

export function DraftScreen() {
  return (
    <MockupRoot scale={2.2} className="relative overflow-hidden bg-(--mk-desk)">
      <div className="absolute left-[7%] top-[7%] w-[86%] text-[0.75em]">
        <DraftDoc sections={5} filled={false} />
      </div>
      <Card className="absolute bottom-[7%] right-[5%] flex w-[72%] flex-col gap-[0.7em] p-[0.9em]">
        <PanelLabel>Assistant · 1 of 3</PanelLabel>
        <Question
          q="When should the agreement take effect?"
          options={["On signing", sample.blanks.effectiveDate, "Skip"]}
          picked={1}
        />
      </Card>
    </MockupRoot>
  )
}

export function SendScreen() {
  return (
    <MockupRoot scale={2.2} className="relative overflow-hidden bg-(--mk-desk)">
      <div className="absolute left-1/2 top-[17%] w-[74%] -translate-x-1/2 text-[1.3em]">
        <SignaturePage filled={false} selected={0} />
      </div>
      <Card className="absolute left-1/2 top-[5%] flex -translate-x-1/2 items-center gap-[0.5em] whitespace-nowrap px-[0.7em] py-[0.4em] text-[0.7em]">
        <span className="size-[0.7em] rounded-full" style={{ background: toneColor(0) }} />
        {first.name}
        <span className="text-(--mk-text-3)">·</span>
        <span className="rounded-full bg-(--mk-muted) px-[0.6em]">Signature</span>
        <span className="text-(--mk-text-2)">Date</span>
        <span className="text-(--mk-text-2)">Text</span>
      </Card>
    </MockupRoot>
  )
}

export function ProveScreen() {
  return (
    <MockupRoot scale={2.4} className="relative overflow-hidden bg-(--mk-desk)">
      <div className="absolute left-1/2 top-[7%] w-[90%] -translate-x-1/2 text-[1.1em]">
        <CertificatePaper />
      </div>
    </MockupRoot>
  )
}

/** The single window the three hero frames merge into: a completed envelope. */
export function AppWindow() {
  return (
    <MockupRoot className="flex flex-col bg-(--mk-bg)">
      <AppTopBar />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-[0.8em] px-[1.6em] pt-[1.2em]">
            <p className="text-[1.3em] font-semibold tracking-[-0.02em]">{sample.title}</p>
            <StatusPill status="Completed" />
            <span className="ml-auto flex gap-[0.5em]">
              <Button>↓ Certificate</Button>
              <Button primary>↓ Signed PDF</Button>
            </span>
          </div>
          <p className="px-[1.6em] pt-[0.3em] text-[0.75em] text-(--mk-text-3)">
            {sample.file} · {sample.pages} pages · code {sample.code}
          </p>
          <div className="relative mt-[1em] flex min-h-0 flex-1 justify-center gap-[1.2em] overflow-hidden bg-(--mk-desk) pt-[1.4em]">
            <div className="hidden w-[40%] text-[1.25em] sm:block">
              <PdfPage />
            </div>
            <div className="w-[60%] text-[1.25em] sm:w-[40%]">
              <SignaturePage />
            </div>
          </div>
        </div>
        <div className="flex w-[34%] flex-col gap-[0.4em] border-l border-(--mk-line) bg-(--mk-surface) p-[1.2em] sm:w-[27%]">
          <PanelLabel>Recipients</PanelLabel>
          {sample.recipients.map((r) => (
            <RecipientRow key={r.email} r={r} />
          ))}
          <div className="mt-[0.8em]">
            <PanelLabel>Activity</PanelLabel>
          </div>
          {sample.events.slice(-4).map((e) => (
            <p key={e.time} className="flex gap-[0.6em] truncate text-[0.72em]">
              <span className="w-[5.5em] shrink-0 text-(--mk-text-3)">{e.time}</span>
              <span className="truncate">
                {e.event} <span className="text-(--mk-text-3)">· {e.actor}</span>
              </span>
            </p>
          ))}
        </div>
      </div>
    </MockupRoot>
  )
}

/* ── Chapter 1: draft ──────────────────────────────────────────── */

export function DraftingWindow() {
  return (
    <MockupRoot className="flex flex-col bg-(--mk-bg)">
      <AppTopBar active="Drafting" />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-[0.6em] border-b border-(--mk-line) bg-(--mk-surface) px-[1.2em] py-[0.6em] text-[0.78em]">
            <span className="font-medium">{sample.title}</span>
            <StatusPill status="Draft" />
            <span className="ml-[1em] hidden gap-[0.9em] text-(--mk-text-2) sm:flex">
              <b>B</b> <i>I</i> <u>U</u> <span>≔</span> <span>⊞</span> <span>§ Section</span>
            </span>
            <span className="ml-auto flex gap-[0.5em]">
              <Button>Preview</Button>
              <Button primary>Finalise</Button>
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden bg-(--mk-desk) px-[8%] pt-[1.6em]">
            <DraftDoc sections={5} signatures />
          </div>
        </div>
        <div className="flex w-[36%] flex-col gap-[0.9em] border-l border-(--mk-line) bg-(--mk-surface) p-[1.1em] sm:w-[30%]">
          <div className="flex gap-[0.4em] text-[0.75em]">
            <span className="rounded-full bg-(--mk-muted) px-[0.8em] py-[0.15em]">Assistant</span>
            <span className="px-[0.5em] py-[0.15em] text-(--mk-text-2)">Blanks 9/12</span>
            <span className="px-[0.5em] py-[0.15em] text-(--mk-text-2)">Signers</span>
          </div>
          <ChatBubble>
            Draft a mutual NDA with {sample.parties[1]} for the cold-chain pilot.
          </ChatBubble>
          <AssistantText>
            I started from the Mutual NDA starter and filled in both parties. Three questions before
            the rest:
          </AssistantText>
          <Card className="flex flex-col gap-[0.8em] p-[0.9em]">
            <Question
              q="How long should confidentiality last?"
              options={["1 year", "2 years", "5 years"]}
              picked={1}
            />
            <Question q="Which law governs it?" options={["Kenya", "Uganda", "Other"]} picked={0} />
          </Card>
          <Composer />
        </div>
      </div>
    </MockupRoot>
  )
}

export function QuestionsDemo() {
  return (
    <MockupRoot
      scale={1.7}
      className="relative flex items-center justify-center gap-[1.6em] p-[1.6em]"
    >
      <div className="hidden w-[46%] text-[0.75em] sm:block">
        <DraftDoc sections={3} filled={false} />
      </div>
      <Card className="flex w-[22em] flex-col gap-[1em] p-[1.2em]">
        <div className="flex items-center justify-between">
          <PanelLabel>A few questions</PanelLabel>
          <span className="text-[0.7em] text-(--mk-text-3)">3 of 12 blanks</span>
        </div>
        <Question
          q="When should the agreement take effect?"
          options={["On signing", sample.blanks.effectiveDate]}
          picked={1}
        />
        <Question
          q="How long should confidentiality last?"
          options={["1 year", "2 years", "5 years"]}
          picked={1}
        />
        <Question q="Which law governs it?" options={["Kenya", "Uganda", "Other"]} />
        <div className="flex justify-end gap-[0.5em]">
          <Button>Skip</Button>
          <Button primary>Fill 3 blanks</Button>
        </div>
      </Card>
    </MockupRoot>
  )
}

export function ProposalDemo() {
  return (
    <MockupRoot scale={3.3} className="flex items-center justify-center p-[1.2em]">
      <Card className="flex w-full flex-col gap-[0.8em] p-[1em]">
        <PanelLabel>Suggested edit · 4. {sample.sections[3]}</PanelLabel>
        <div className="flex flex-col gap-[0.4em] text-[0.75em] leading-[1.5]">
          <p className="rounded-[0.4em] bg-(--mk-danger-bg) px-[0.6em] py-[0.3em] text-(--mk-danger) line-through">
            Either party may end this Agreement at any time.
          </p>
          <p className="rounded-[0.4em] bg-(--mk-success-bg) px-[0.6em] py-[0.3em] text-(--mk-success)">
            Either party may end this Agreement with 30 days&apos; written notice. Obligations under
            section 3 survive.
          </p>
        </div>
        <div className="flex justify-end gap-[0.5em]">
          <Button>Reject</Button>
          <Button primary>Accept</Button>
        </div>
      </Card>
    </MockupRoot>
  )
}

export function SignersDemo() {
  return (
    <MockupRoot scale={3.3} className="flex items-center justify-center p-[1.2em]">
      <Card className="flex w-full flex-col gap-[0.5em] p-[1em]">
        <PanelLabel>Suggested signers</PanelLabel>
        {[first, second].map((r) => (
          <div
            key={r.email}
            className="rounded-[0.6em] border border-(--mk-line) px-[0.6em] py-[0.2em]"
          >
            <RecipientRow r={r} status={false} detail={r.email} />
            <div className="flex flex-wrap gap-[0.3em] pb-[0.4em] text-[0.62em]">
              {["Signature", "Full name", "Date signed"].map((f) => (
                <span
                  key={f}
                  className="rounded-[0.3em] border px-[0.5em]"
                  style={{ borderColor: toneColor(r.tone), color: toneColor(r.tone) }}
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        ))}
        <div className="flex justify-end gap-[0.5em] pt-[0.3em]">
          <Button>Edit</Button>
          <Button primary>Accept</Button>
        </div>
      </Card>
    </MockupRoot>
  )
}

/* ── Chapter 2: send ───────────────────────────────────────────── */

export function FieldEditorWindow() {
  const steps = ["Documents", "Recipients", "Fields", "Review"]
  return (
    <MockupRoot className="flex flex-col bg-(--mk-bg)">
      <div className="flex h-[3em] shrink-0 items-center gap-[1em] border-b border-(--mk-line) bg-(--mk-surface) px-[1.2em] text-[0.8em]">
        <span className="text-(--mk-text-2)">✕</span>
        <span className="font-medium">{sample.title}</span>
        <span className="mx-auto hidden items-center gap-[0.2em] rounded-full bg-(--mk-muted) p-[0.2em] sm:flex">
          {steps.map((s, i) => (
            <span
              key={s}
              className={`rounded-full px-[0.8em] py-[0.15em] ${
                i === 2 ? "bg-(--mk-surface) shadow-(--mk-shadow)" : "text-(--mk-text-2)"
              }`}
            >
              {i + 1}. {s}
            </span>
          ))}
        </span>
        <Button primary className="ml-auto sm:ml-0">
          Review &amp; send
        </Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[24%] flex-col gap-[0.3em] border-r border-(--mk-line) bg-(--mk-surface) p-[1.1em] sm:flex">
          <PanelLabel>Recipients · in order</PanelLabel>
          {sample.recipients.map((r, i) => (
            <RecipientRow
              key={r.email}
              r={r}
              order={i + 1}
              status={false}
              detail={r.role === "Gets a copy" ? r.role : `${r.role} · ${r.verify}`}
            />
          ))}
          <div className="mt-[1em]">
            <PanelLabel>Fields</PanelLabel>
          </div>
          {["Signature", "Initials", "Date signed", "Full name", "Text", "Checkbox"].map((f, i) => (
            <span
              key={f}
              className={`rounded-[0.5em] px-[0.6em] py-[0.25em] text-[0.75em] ${
                i === 0 ? "bg-(--mk-muted)" : "text-(--mk-text-2)"
              }`}
            >
              {f}
            </span>
          ))}
        </div>
        <div className="relative flex min-w-0 flex-1 justify-center overflow-hidden bg-(--mk-desk) pt-[1.6em]">
          <div className="w-[64%] text-[1.4em]">
            <SignaturePage filled={false} selected={2} />
          </div>
        </div>
        <div className="flex w-[30%] flex-col gap-[0.2em] border-l border-(--mk-line) bg-(--mk-surface) p-[1.1em] sm:w-[22%]">
          <PanelLabel>Field</PanelLabel>
          <SettingRow label="Type" value="Signature" />
          <SettingRow
            label="Signer"
            value={
              <span className="flex items-center gap-[0.4em]">
                <span className="size-[0.6em] rounded-full" style={{ background: toneColor(1) }} />
                {second.name.split(" ")[0]}
              </span>
            }
          />
          <SettingRow label="Required" value="Yes" />
          <SettingRow label="Page" value={`${sample.pages} of ${sample.pages}`} />
          <p className="mt-[0.8em] text-[0.7em] leading-[1.5] text-(--mk-text-3)">
            Drag to move, arrow keys to nudge, ⌫ to remove.
          </p>
        </div>
      </div>
    </MockupRoot>
  )
}

export function SigningDemo() {
  return (
    <MockupRoot
      scale={1.6}
      className="relative flex items-center justify-center gap-[2em] p-[1.4em]"
    >
      <div className="flex h-[92%] w-[15em] shrink-0 flex-col overflow-hidden rounded-[2em] border-[0.45em] border-(--mk-accent) bg-(--mk-bg)">
        <div className="flex items-center justify-between bg-(--mk-surface) px-[1em] py-[0.7em] text-[0.7em]">
          <span className="font-medium">{sample.title}</span>
          <span className="text-(--mk-text-3)">from {sample.workspace}</span>
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden bg-(--mk-desk) px-[0.8em] pt-[0.8em]">
          <PdfPage heading={false} className="text-[1.3em]">
            <TextLines widths={[100, 94, 98, 60, 100, 88]} />
            <FieldBox tone={1} label="Sign here" at={[8, 52, 50, 11]} selected />
            <FieldBox tone={1} label="Date signed" at={[8, 67, 34, 6]} filled="14 Oct 2026" />
          </PdfPage>
        </div>
        <div className="flex flex-col gap-[0.5em] bg-(--mk-surface) px-[1em] py-[0.8em]">
          <div className="h-[0.3em] overflow-hidden rounded-full bg-(--mk-muted)">
            <div className="h-full w-2/3 rounded-full bg-(--mk-accent)" />
          </div>
          <div className="flex items-center justify-between text-[0.7em]">
            <span className="text-(--mk-text-2)">2 of 3 fields</span>
            <Button primary>Next field ↓</Button>
          </div>
        </div>
      </div>
      <Card className="hidden w-[20em] flex-col gap-[0.8em] p-[1.1em] sm:flex">
        <p className="text-[0.85em] font-medium">Add your signature</p>
        <div className="flex gap-[0.3em] text-[0.72em]">
          <span className="rounded-full bg-(--mk-muted) px-[0.8em]">Draw</span>
          <span className="px-[0.5em] text-(--mk-text-2)">Type</span>
          <span className="px-[0.5em] text-(--mk-text-2)">Upload</span>
        </div>
        <div className="grid h-[6.5em] place-items-center rounded-[0.6em] border border-dashed border-(--mk-line) bg-(--mk-paper)">
          <Signature className="h-[60%] w-[70%] text-[#1e3a8a]" />
        </div>
        <p className="text-[0.65em] leading-[1.5] text-(--mk-text-3)">
          I agree to sign electronically and that this signature is as valid as my handwritten one.
        </p>
        <div className="flex justify-end gap-[0.5em]">
          <Button>Clear</Button>
          <Button primary>Adopt and sign</Button>
        </div>
      </Card>
    </MockupRoot>
  )
}

export function OtpDemo() {
  const digits = ["4", "8", "1", "", "", ""]
  return (
    <MockupRoot scale={3.3} className="flex items-center justify-center p-[1.2em]">
      <Card className="flex w-full flex-col items-center gap-[0.8em] p-[1.3em] text-center">
        <span className="grid size-[2.2em] place-items-center rounded-full bg-(--mk-muted)">✆</span>
        <p className="text-[0.95em] font-medium">Check your phone</p>
        <p className="text-[0.72em] text-(--mk-text-2)">
          We sent a 6-digit code to +254 7•• ••• 488
        </p>
        <div className="flex gap-[0.35em]">
          {digits.map((d, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed six slots
              key={i}
              className={`grid h-[2.2em] w-[1.8em] place-items-center rounded-[0.5em] border text-[0.9em] ${
                i === 3 ? "border-(--mk-accent)" : "border-(--mk-line)"
              }`}
            >
              {d}
            </span>
          ))}
        </div>
        <p className="text-[0.65em] text-(--mk-text-3)">Resend in 24 s</p>
      </Card>
    </MockupRoot>
  )
}

export function RoutingDemo() {
  return (
    <MockupRoot scale={3.3} className="flex items-center justify-center p-[1.2em]">
      <Card className="flex w-full flex-col p-[1em]">
        <PanelLabel>Signing order</PanelLabel>
        <div className="relative mt-[0.3em]">
          <span className="absolute bottom-[1.3em] left-[0.6em] top-[1.3em] w-px bg-(--mk-line)" />
          {sample.recipients.map((r, i) => (
            <RecipientRow key={r.email} r={r} order={i + 1} status={false} />
          ))}
        </div>
        <div className="mt-[0.5em]">
          <SettingRow label="Order" value="One after another" />
          <SettingRow label="Reminders" value="Every 3 days" />
          <SettingRow label="Expires" value="30 Nov 2026" />
        </div>
      </Card>
    </MockupRoot>
  )
}

/* ── Chapter 3: prove ──────────────────────────────────────────── */

/** The Certificate of Completion, as `renderCertificate` lays it out. */
function CertificatePaper({ compact = false }: { compact?: boolean }) {
  const signers = sample.recipients.filter((r) => r.status === "Signed")
  return (
    <div className="flex flex-col gap-[0.9em] bg-(--mk-paper) p-[1.6em] text-(--mk-paper-ink) shadow-[0_0.2em_0.8em_rgb(0_0_0/0.12)]">
      <div className="flex items-start justify-between gap-[1em]">
        <div>
          <p className="text-[0.55em] tracking-[0.12em] opacity-60">SAHIHI</p>
          <p className="text-[1em] font-semibold tracking-[-0.01em]">Certificate of Completion</p>
          <p className="mt-[0.2em] text-[0.62em] opacity-60">
            {sample.title} · {sample.workspace}
          </p>
        </div>
        <div className="flex flex-col items-center gap-[0.3em]">
          <QrCode className="size-[3.6em] text-(--mk-paper-ink)" />
          <span className="font-mono text-[0.5em]">{sample.code}</span>
        </div>
      </div>
      <div className="flex flex-col gap-[0.3em] border-y border-(--mk-paper-line) py-[0.6em]">
        <HashRow label="Original SHA-256" value={sample.originalSha256} />
        <HashRow label="Signed SHA-256" value={sample.signedSha256} />
        {!compact && <HashRow label="Audit chain head" value={sample.chainHead} />}
      </div>
      <div className="flex flex-col gap-[0.5em]">
        {signers.map((r) => (
          <div key={r.email} className="flex items-center gap-[0.7em] text-[0.62em]">
            <span className="text-[#15803d]">✓</span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{r.name}</span>
              {!compact && (
                <span className="block opacity-60">
                  {r.verify} · {r.ip}
                </span>
              )}
            </span>
            <span className="opacity-60">{r.signedAt}</span>
          </div>
        ))}
      </div>
      {!compact && (
        <div className="flex flex-col gap-[0.25em] border-t border-(--mk-paper-line) pt-[0.6em]">
          {sample.events.map((e) => (
            <p key={e.time} className="flex gap-[1em] text-[0.55em]">
              <span className="w-[7em] shrink-0 opacity-60">{e.time}</span>
              <span className="flex-1">{e.event}</span>
              <span className="opacity-60">{e.actor}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

export function CertificateWindow() {
  return (
    <MockupRoot className="flex flex-col bg-(--mk-bg)">
      <WindowBar url={`sahihi.co.ke/verify/${sample.code}`} />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 justify-center overflow-hidden bg-(--mk-desk) px-[4%] pt-[1.6em]">
          <div className="w-full max-w-[34em] text-[1.05em]">
            <CertificatePaper />
          </div>
        </div>
        <div className="flex w-[34%] flex-col gap-[0.7em] border-l border-(--mk-line) bg-(--mk-surface) p-[1.2em] sm:w-[28%]">
          <div className="flex items-center gap-[0.5em] rounded-[0.7em] bg-(--mk-success-bg) px-[0.8em] py-[0.6em] text-[0.78em] text-(--mk-success)">
            ✓ Valid certificate
          </div>
          <PanelLabel>Envelope</PanelLabel>
          <SettingRow label="Document" value={sample.file} />
          <SettingRow label="Pages" value={sample.pages} />
          <SettingRow label="Completed" value="14 Oct 2026" />
          <SettingRow label="Provider" value="Sahihi" />
          <PanelLabel>Signers</PanelLabel>
          {[first, second].map((r) => (
            <div key={r.email} className="flex items-center gap-[0.6em] text-[0.75em]">
              <Avatar name={r.name} tone={r.tone} />
              <span className="truncate">{r.name}</span>
              <span className="ml-auto text-(--mk-text-3)">
                {r.email.replace(/^(.).*@/, "$1•••@")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </MockupRoot>
  )
}

export function VerifyDemo() {
  return (
    <MockupRoot scale={3.3} className="flex items-center justify-center p-[1.2em]">
      <Card className="flex w-full flex-col gap-[0.8em] p-[1em]">
        <p className="text-[0.95em] font-medium">Verify a document</p>
        <div className="flex flex-col items-center gap-[0.4em] rounded-[0.7em] border border-dashed border-(--mk-line) bg-(--mk-muted) py-[1em] text-[0.72em]">
          <span className="grid h-[2.4em] w-[1.9em] place-items-end rounded-[0.25em] bg-(--mk-paper) p-[0.2em] text-[0.6em] font-semibold text-[#b91c1c] shadow-sm">
            PDF
          </span>
          <span>{sample.title} (signed).pdf</span>
          <span className="font-mono text-[0.85em] text-(--mk-text-3)">
            {shortHash(sample.signedSha256)}
          </span>
        </div>
        <div className="flex items-center gap-[0.6em] rounded-[0.7em] bg-(--mk-success-bg) px-[0.8em] py-[0.5em] text-[0.75em] text-(--mk-success)">
          ✓ Matches a signed document · {sample.code}
        </div>
        <p className="text-[0.65em] text-(--mk-text-3)">
          Hashed in your browser. The file never leaves this device.
        </p>
      </Card>
    </MockupRoot>
  )
}

export function AuditDemo() {
  const chain = sample.events.slice(1)
  const hashes = [
    sample.originalSha256,
    sample.signedSha256,
    sample.chainHead,
    sample.originalSha256.split("").reverse().join(""),
    sample.signedSha256.split("").reverse().join(""),
  ]
  return (
    <MockupRoot scale={3.3} className="flex items-center justify-center p-[1.2em]">
      <Card className="flex w-full flex-col p-[1em]">
        <PanelLabel>Audit trail · append-only</PanelLabel>
        <div className="relative mt-[0.5em] flex flex-col gap-[0.55em]">
          <span className="absolute bottom-[0.6em] left-[0.35em] top-[0.6em] w-px bg-(--mk-line)" />
          {chain.map((e, i) => (
            <div
              key={e.time}
              className="relative flex items-center gap-[0.7em] pl-[1.3em] text-[0.68em]"
            >
              <span className="absolute left-0 size-[0.75em] rounded-full border-[0.15em] border-(--mk-surface) bg-(--mk-accent)" />
              <span className="min-w-0 flex-1 truncate">
                {e.event} <span className="text-(--mk-text-3)">· {e.actor}</span>
              </span>
              <span className="font-mono text-[0.9em] text-(--mk-text-3)">
                {hashes[i].slice(0, 6)}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-[0.7em] text-[0.62em] text-(--mk-text-3)">
          Each hash covers the previous one. Head {shortHash(sample.chainHead, 6)} is on the
          certificate.
        </p>
      </Card>
    </MockupRoot>
  )
}
