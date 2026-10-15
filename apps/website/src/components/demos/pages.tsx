/**
 * Full app screens, coded at the app's real proportions: each is a 16:10 canvas whose font size is
 * 1% of its width (14.4 px at the app's 1440 px), so sizes below read as the app's own px ÷ 14.4.
 * They copy the real screens (All files, the drafting editor, the envelope editor, a completed
 * envelope) and follow the theme through the `--dm-*` palette. Data comes from `sample`.
 */
import type { ReactNode } from "react"
import { s as settle } from "@/components/ui/settleMarks"
import { sample } from "@/content/site"
import { Badge, Icon, tone } from "./parts"

/**
 * The canvas inside a ChromeFrame. `zoom` > 1 shows part of the screen larger (the hero's small
 * frames); `focus` picks which part, as fractions of the overflow ([0, 0] = top left).
 */
export function Screen({
  children,
  zoom = 1,
  focus = [0, 0],
}: {
  children: ReactNode
  zoom?: number
  focus?: [number, number]
}) {
  const [fx, fy] = focus
  return (
    <div
      aria-hidden
      className="demo absolute inset-0 overflow-hidden bg-(--dm-bg)"
      style={{ containerType: "size" }}
    >
      <div
        className="absolute [container-type:inline-size]"
        style={{
          width: `${zoom * 100}%`,
          aspectRatio: "16 / 10",
          left: `calc(${-fx} * (${zoom} * 100cqw - 100cqw))`,
          top: `calc(${-fy} * (${zoom} * 62.5cqw - 100cqh))`,
        }}
      >
        <div className="screen-root flex h-full flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  )
}

/* ── Shared chrome ─────────────────────────────────────────────── */

function Button({
  icon,
  children,
  kind = "outline",
  className = "",
}: {
  icon?: string
  children?: ReactNode
  kind?: "outline" | "ghost" | "primary" | "danger"
  className?: string
}) {
  const look = {
    outline: "border border-(--dm-line) bg-(--dm-card)",
    ghost: "text-(--dm-text-2)",
    primary: "bg-(--dm-accent) text-(--dm-on-accent)",
    danger: "border border-(--dm-danger)/30 text-(--dm-danger)",
  }[kind]
  return (
    <span
      className={`inline-flex h-[3.05em] shrink-0 items-center gap-[0.55em] rounded-[0.9em] px-[1.15em] text-[0.97em] ${look} ${className}`}
    >
      {icon && <Icon name={icon} className="text-[1.15em]" />}
      {children}
    </span>
  )
}

function Logo() {
  return (
    <span className="flex items-center gap-[0.45em] text-[1.11em]">
      <Icon name="sign" className="text-[1.3em]" />
      Sahihi
    </span>
  )
}

function Avatar({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full border border-(--dm-line) bg-(--dm-muted) ${
        small ? "size-[1.85em] text-[0.62em]" : "size-[2.25em] text-[0.75em]"
      }`}
    >
      {sample.user.initials}
    </span>
  )
}

/** The app's top bar: logo, workspace switcher, the three places, the account. */
function TopBar({ active = "All files" }: { active?: string }) {
  const nav = [
    ["folder", "All files"],
    ["sparkles", "Drafting"],
    ["inbox", "Inbox"],
  ]
  return (
    <div className="flex h-[4.45em] shrink-0 items-center gap-[0.9em] border-b border-(--dm-line) bg-(--dm-card) px-[1.65em]">
      <Logo />
      <span className="h-[1.4em] w-px bg-(--dm-line)" />
      <span className="flex h-[2.5em] items-center gap-[0.55em] rounded-[0.9em] border border-(--dm-line) px-[0.85em] text-[0.97em]">
        <Icon name="building" className="text-(--dm-text-2)" />
        {sample.workspace}
        <Icon name="chevronDown" className="text-[0.8em] text-(--dm-text-2)" />
      </span>
      <nav className="ml-[1.3em] flex shrink-0 items-center rounded-full bg-(--dm-muted) p-[0.25em]">
        {nav.map(([icon, label]) => (
          <span
            key={label}
            className={`flex h-[2.5em] items-center gap-[0.5em] rounded-full px-[1em] text-[0.97em] ${
              label === active ? "bg-(--dm-card) shadow-sm" : "text-(--dm-text-2)"
            }`}
          >
            <Icon name={icon as string} />
            {label}
            {label === "Inbox" && (
              <span className="grid size-[1.5em] place-items-center rounded-full border border-(--dm-strong) text-[0.75em]">
                {sample.inbox}
              </span>
            )}
          </span>
        ))}
      </nav>
      {/* Global search (the app's ADR 0056), ending on the page content's right edge (87.75%). */}
      <span className="flex min-w-0 flex-1 justify-end">
        <span className="flex h-[2.5em] w-full max-w-[26.7em] items-center gap-[0.55em] rounded-full bg-(--dm-muted) ps-[0.85em] pe-[0.4em] text-[0.97em] text-(--dm-text-3)">
          <Icon name="search" className="text-[1.05em]" />
          <span className="flex-1">Search</span>
          <span className="rounded-[0.35em] border border-(--dm-line) bg-(--dm-card) px-[0.4em] py-[0.1em] text-[0.75em] text-(--dm-text-2)">
            ⌘K
          </span>
        </span>
      </span>
      {/* The page's right margin less the bar's padding and the gap before it. */}
      <span className="flex w-[calc(12.25%-2.15em)] shrink-0 justify-end">
        <Avatar />
      </span>
    </div>
  )
}

function Check() {
  return <span className="size-[1.2em] shrink-0 rounded-[0.3em] border border-(--dm-strong)" />
}

/* ── All files ─────────────────────────────────────────────────── */

const badgeTone = {
  neutral: "bg-(--dm-muted) text-(--dm-text-2)",
  info: "bg-(--dm-tone-0)/10 text-(--dm-tone-0)",
  success: "bg-(--dm-success-bg) text-(--dm-success)",
}

/* Name | Type | Status | Recipients | Added | ⋮, as in the app's list view (its ADR 0058 redesign). */
const filesCols = "grid-cols-[2.4em_1fr_7.6em_9.6em_16em_8.6em_1.6em]"

export function FilesScreen() {
  return (
    <div className="flex h-full flex-col bg-(--dm-canvas)">
      <TopBar />
      <div className="mx-auto flex w-[75.5%] flex-col pt-[2.2em]">
        <div className="flex items-center justify-between">
          <p className="flex items-baseline gap-[0.6em]">
            <span className="text-[1.95em] leading-[1.2] tracking-[-0.01em]">All files</span>
            <span className="text-[0.97em] text-(--dm-text-2)">{sample.files.length} items</span>
          </p>
          <div className="flex gap-[0.55em]">
            <Button icon="folderPlus" className="px-[0.95em]" />
            <Button icon="upload">Upload document</Button>
            <Button icon="plus" kind="primary">
              New envelope
            </Button>
          </div>
        </div>
        <div className="mt-[2.2em] flex items-center gap-[0.55em]">
          <span className="flex h-[3.05em] w-[22em] items-center gap-[0.75em] rounded-[0.9em] bg-(--dm-muted) px-[1em] text-[0.97em] text-(--dm-text-3)">
            <Icon name="search" className="text-[1.15em]" />
            Search files
          </span>
          {["Type", "Status", "People", "Added"].map((c) => (
            <span
              key={c}
              className="flex h-[2.5em] items-center gap-[0.6em] rounded-full border border-(--dm-line) px-[0.9em] text-[0.97em]"
            >
              {c}
              <Icon name="chevronDown" className="text-[0.8em] text-(--dm-text-2)" />
            </span>
          ))}
          <span className="ml-auto flex rounded-[0.9em] border border-(--dm-line) bg-(--dm-muted) p-[0.2em] text-[0.97em]">
            <span className="rounded-[0.5em] bg-(--dm-card) px-[0.85em] py-[0.35em] shadow-sm">
              List
            </span>
            <span className="px-[0.85em] py-[0.35em] text-(--dm-text-3)">Grid</span>
          </span>
        </div>
        <div className="mt-[1.6em] rounded-[1.35em] border border-(--dm-line) bg-(--dm-card) px-[0.85em] pb-[0.85em]">
          {/* Font size on the labels, not the row: the columns are in em and must match the rows'. */}
          <div
            className={`grid h-[3.6em] ${filesCols} items-center px-[0.9em] text-(--dm-text-2) [&>span]:text-[0.97em]`}
          >
            <Check />
            <span>Name</span>
            <span>Type</span>
            <span>Status</span>
            <span>Recipients</span>
            <span>Added</span>
          </div>
          {sample.files.map((f) => (
            <div
              key={f.name}
              className={`grid h-[3.5em] ${filesCols} items-center border-t border-(--dm-line) px-[0.9em]`}
            >
              <Check />
              <span className="flex min-w-0 items-center gap-[0.85em]">
                {f.kind === "pdf" ? (
                  <span className="grid h-[1.4em] w-[1.15em] shrink-0 place-items-end rounded-[0.2em] border-[0.12em] border-[#dc2626] pb-[0.05em] text-[0.45em] font-bold text-[#dc2626]">
                    PDF
                  </span>
                ) : (
                  <Icon name="mail" className="text-[1.2em] text-(--dm-text-2)" />
                )}
                <span className="truncate pe-[1em] text-[0.97em]">{f.name}</span>
              </span>
              <span className="text-[0.97em] text-(--dm-text-2)">
                {f.kind === "pdf" ? "Document" : "Envelope"}
              </span>
              <span>
                {f.status && (
                  <span
                    className={`rounded-full px-[0.7em] py-[0.2em] text-[0.8em] ${badgeTone[f.status.tone]}`}
                  >
                    {f.status.label}
                  </span>
                )}
              </span>
              <span className="truncate pe-[1em] text-[0.97em] text-(--dm-text-2)">
                {f.recipients}
              </span>
              <span className="text-[0.97em] text-(--dm-text-2)">{sample.added}</span>
              <Icon name="more" className="text-(--dm-text-2)" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Completed envelope ────────────────────────────────────────── */

function ViewerBar({ page, zoom }: { page: string; zoom: string }) {
  return (
    <div className="flex h-[3.3em] shrink-0 items-center gap-[1.1em] border-b border-(--dm-line) px-[1.1em] text-[0.97em]">
      <Icon name="sidebar" className="text-(--dm-text-2)" />
      <span>{page}</span>
      <span className="ml-auto flex items-center gap-[1em] text-(--dm-text-2)">
        <Icon name="rotateCw" />
        <Icon name="rotateCcw" />
        <span className="h-[1.1em] w-px bg-(--dm-line)" />
        <Icon name="zoomOut" />
        <span className="flex w-[6.5em] items-center justify-between rounded-[0.9em] border border-(--dm-strong) px-[0.6em] py-[0.25em] text-(--dm-text)">
          {zoom}
          <Icon name="updown" className="text-[0.8em]" />
        </span>
        <Icon name="zoomIn" />
        <span className="h-[1.1em] w-px bg-(--dm-line)" />
        <Icon name="search" />
        <Icon name="moreH" />
      </span>
    </div>
  )
}

export function EnvelopeScreen() {
  return (
    <div className="flex h-full flex-col bg-(--dm-canvas)">
      <TopBar />
      <div className="mx-auto flex w-[75.5%] flex-col pt-[2.6em]">
        <p className="flex items-center gap-[0.6em] text-[0.97em]">
          <span className="text-(--dm-text-2)">All files</span>
          <Icon name="chevronRight" className="text-[0.8em] text-(--dm-text-3)" />
          {sample.nda}
        </p>
        <div className="mt-[2em] flex items-start justify-between">
          <div>
            <p className="flex items-center gap-[0.55em]">
              <span className="text-[1.95em] leading-[1.15] tracking-[-0.01em]">{sample.nda}</span>
              <Badge kind="success">Completed</Badge>
            </p>
            <p className="mt-[0.45em] text-[0.97em] text-(--dm-text-2)">
              Signing in parallel · No expiry
            </p>
          </div>
          <div className="mt-[0.4em] flex gap-[0.55em]">
            <Button icon="template">Save as template</Button>
            <Button icon="eraser" kind="danger">
              Delete data
            </Button>
            <Button icon="copy">Copy status</Button>
          </div>
        </div>
        <div
          {...settle(0, 200)}
          className="mt-[1.7em] rounded-[1.35em] border border-(--dm-line) bg-(--dm-card) p-[1.65em]"
        >
          <p className="text-[1.1em]">Signed and certified</p>
          <p className="mt-[0.3em] text-[0.97em] text-(--dm-text-2)">
            Everyone signed on 13 Oct 2026. The signed PDF and the Certificate of Completion are
            ready.
          </p>
          <div className="mt-[1.3em] flex items-center gap-[0.55em]">
            <Button icon="download" kind="primary">
              Signed document
            </Button>
            <Button icon="download">Certificate</Button>
            <span className="ml-auto text-[0.97em] text-(--dm-text-2)">
              Certificate <span className="font-mono text-(--dm-text)">{sample.certificate}</span> ·{" "}
              <span className="underline underline-offset-[0.2em]">Public verification page</span>
            </span>
          </div>
        </div>
        <div className="mt-[2.3em] inline-flex w-fit rounded-[0.9em] border border-(--dm-line) bg-(--dm-muted) p-[0.3em] text-[0.97em]">
          <span className="rounded-[0.5em] bg-(--dm-card) px-[1em] py-[0.45em] text-(--dm-ink) shadow-sm">
            Documents
          </span>
          <span className="px-[1em] py-[0.45em] text-(--dm-text-2)">Recipients 3</span>
          <span className="px-[1em] py-[0.45em] text-(--dm-text-2)">Activity 13</span>
        </div>
        <div className="mt-[3em] rounded-[1.35em] border border-(--dm-line) bg-(--dm-card) p-[1.65em]">
          <p className="text-[1.1em]">{sample.ndaFile}</p>
          <p className="mt-[0.3em] text-[0.97em] text-(--dm-text-2)">
            3 pages · 6 fields · the originals, as sent for signing
          </p>
          <div className="mt-[1.4em] overflow-hidden rounded-[0.9em] border border-(--dm-line)">
            <ViewerBar page="Page 1 of 3" zoom="166%" />
            <div className="bg-(--dm-muted) px-[1.6em] pt-[1.6em]">
              <div className="h-[20em] bg-(--dm-paper) px-[8%] pt-[5%] text-(--dm-paper-ink)">
                <p className="text-[1.95em] font-bold tracking-[-0.01em]">{sample.draft.title}</p>
                <p className="mt-[1em] text-[1.2em] font-bold">1. Parties and Effective Date</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Drafting editor ───────────────────────────────────────────── */

function Filled({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return (
    <span
      className={`underline decoration-dotted decoration-[0.1em] underline-offset-[0.25em] ${strong ? "font-semibold" : ""}`}
      style={{ textDecorationColor: tone(0) }}
    >
      {children}
    </span>
  )
}

export function DraftingScreen() {
  const d = sample.draft
  const q = sample.question
  return (
    <>
      <div className="flex h-[4.45em] shrink-0 items-center gap-[0.9em] border-b border-(--dm-line) px-[2.2em]">
        <Icon name="chevronLeft" className="text-(--dm-text-2)" />
        <span className="text-[1.1em]">{d.title}</span>
        <Badge>{d.version}</Badge>
        <span className="ml-auto flex h-[3.05em] items-center rounded-[0.9em] bg-(--dm-accent) text-[0.97em] text-(--dm-on-accent)">
          <span className="px-[1.1em]">Finalise</span>
          <span className="flex h-full items-center border-l border-(--dm-on-accent)/20 px-[0.8em]">
            <Icon name="chevronDown" className="text-[0.85em]" />
          </span>
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        {/* The assistant. */}
        <div className="flex w-[40%] shrink-0 flex-col border-r border-(--dm-line)">
          <div className="flex min-h-0 flex-1 flex-col gap-[1em] overflow-hidden p-[1.4em]">
            <p className="ml-auto w-[88%] rounded-[1.35em] bg-(--dm-muted) px-[1.1em] py-[0.8em] text-[0.97em] leading-[1.5]">
              {sample.chat.ask}
            </p>
            <p className="flex gap-[0.5em] text-[0.8em] text-(--dm-text-3)">
              <Icon name="check" className="mt-[0.2em] text-(--dm-success)" />
              {sample.chat.updated}
            </p>
            <p className="text-[0.97em]">{sample.chat.reply}</p>
            {/* The focus of this screen: it lands, then its choices (only where a Settle wraps it). */}
            <div
              {...settle(0, 200)}
              className="overflow-hidden rounded-[1.35em] border border-(--dm-tone-0)/40 bg-(--dm-card)"
            >
              <div className="flex flex-col gap-[0.3em] px-[1.1em] pt-[1em] pb-[0.9em]">
                <div className="flex items-center gap-[0.6em] text-(--dm-text-3)">
                  <Icon name="chevronLeft" className="text-[0.85em]" />
                  <span className="font-mono text-[0.72em] tracking-[0.14em] uppercase">
                    {q.index}
                  </span>
                  <Icon name="x" className="ml-auto" />
                </div>
                <p className="mt-[0.2em] text-[1.1em]">{q.text}</p>
                <p className="text-[0.8em] text-(--dm-text-3)">Fills: {q.fills}</p>
                <div className="mt-[0.4em] flex flex-col gap-[0.45em]">
                  {q.options.map((o, i) => (
                    <span
                      key={o}
                      {...settle(i, 380)}
                      className="flex h-[2.75em] items-center gap-[1em] rounded-[0.9em] border border-(--dm-strong) px-[1em] text-[0.97em]"
                    >
                      <span className="text-[0.8em] text-(--dm-text-3)">{i + 1}</span>
                      {o}
                      <Icon name="chevronRight" className="ml-auto text-(--dm-text-3)" />
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-[0.6em] border-t border-(--dm-line) bg-(--dm-muted)/60 px-[1.1em] py-[0.9em]">
                <span className="text-[0.88em]">Or type your own answer</span>
                <span className="h-[2.7em] rounded-[0.9em] border border-(--dm-text) bg-(--dm-card)" />
                <div className="flex items-center justify-between text-[0.97em]">
                  <span className="px-[0.4em] text-(--dm-text-2)">Skip</span>
                  <span className="flex items-center gap-[0.3em] rounded-[0.9em] bg-(--dm-disabled) px-[1.1em] py-[0.5em] text-white">
                    Answer <Icon name="chevronRight" className="text-[0.8em]" />
                  </span>
                </div>
              </div>
            </div>
          </div>
          <p className="shrink-0 border-t border-(--dm-line) px-[1.4em] py-[1em] text-[0.88em] text-(--dm-text-2)">
            Answer or dismiss the questions above to keep chatting.
          </p>
        </div>

        {/* The document, as Preview shows it. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-[6.5em] shrink-0 items-center border-b border-(--dm-line) px-[1.4em]">
            <span className="flex rounded-[0.9em] border border-(--dm-line) bg-(--dm-muted) p-[0.3em] text-[0.97em]">
              <span className="rounded-[0.5em] bg-(--dm-card) px-[1em] py-[0.45em] shadow-sm">
                Preview
              </span>
              {["Editing", "Signers", "PDF"].map((t) => (
                <span key={t} className="px-[1em] py-[0.45em] text-(--dm-text-2)">
                  {t}
                </span>
              ))}
            </span>
            <span className="ml-auto rounded-full border border-(--dm-warn)/40 bg-(--dm-warn-bg) px-[0.6em] py-[0.15em] text-[0.75em] text-(--dm-warn)">
              {d.blanksOpen}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden pt-[3em] pr-[6%] pl-[19%] text-[1.1em] leading-[1.75]">
            <p className="text-[1.75em] leading-[1.2] font-semibold tracking-[-0.01em]">
              {d.title}
            </p>
            <p className="mt-[1.1em] text-[1.12em] font-semibold">1. Parties and Effective Date</p>
            <p className="mt-[0.6em]">
              This Mutual Non-Disclosure Agreement (the &quot;Agreement&quot;) is made on{" "}
              <span className="rounded-[0.4em] border border-dashed border-(--dm-warn) bg-(--dm-warn-bg) px-[0.4em] py-[0.05em] text-[0.92em]">
                {d.effective}
              </span>{" "}
              (the &quot;Effective Date&quot;) between:
            </p>
            {d.parties.map((p, i) => (
              <p key={p.name} className="pl-[0.9em]">
                {i ? "b." : "a."} <Filled strong>{p.name}</Filled> of <Filled>{p.address}</Filled>
                {i ? "." : "; and"}
              </p>
            ))}
            <p>
              Each is a &quot;Party&quot; and together they are the &quot;Parties&quot;. Each Party
              may disclose information (as the &quot;Disclosing Party&quot;) and receive information
              (as the &quot;Receiving Party&quot;).
            </p>
            <p className="mt-[1em] text-[1.12em] font-semibold">2. Purpose</p>
            <p className="mt-[0.6em]">
              The Parties wish to exchange confidential information in connection with{" "}
              <Filled>{d.purpose}</Filled> (the &quot;Purpose&quot;). The Receiving Party may use
              the Disclosing Party&apos;s Confidential Information only for the Purpose.
            </p>
            <p className="mt-[1em] text-[1.12em] font-semibold">3. Confidential Information</p>
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Envelope editor ───────────────────────────────────────────── */

function PlacedField({
  label,
  width,
  height,
  selected = false,
}: {
  label: string
  width: string
  height: string
  selected?: boolean
}) {
  return (
    // The selected field drops into place, as if just placed (only where a Settle wraps it).
    <span {...(selected ? settle(0, 320, "pop") : {})} className="mt-[0.25em] block">
      <span
        className="flex items-center justify-center gap-[0.3em] rounded-[0.9em] border-[0.13em] text-[0.6em]"
        style={{
          width,
          height,
          borderColor: tone(0),
          color: tone(0),
          background: "color-mix(in oklab, var(--dm-tone-0) 10%, white)",
          boxShadow: selected ? "0 0 0 0.18em #555" : undefined,
        }}
      >
        <Icon name="lock" className="text-[0.9em]" />
        {label} *
      </span>
    </span>
  )
}

export function EditorScreen() {
  const b = sample.board
  const steps = [
    ["draft", "Documents"],
    ["users", "Recipients"],
    ["pointer", "Fields"],
    ["eye", "Preview"],
  ]
  const tools = [
    ["pointer", "Select"],
    ["sign", "Signature"],
    ["pen", "Initials"],
    ["calendar", "Date signed"],
    ["user", "Full name"],
    ["at", "Email"],
    ["text", "Text"],
    ["checkbox", "Checkbox"],
  ]
  return (
    <>
      <div className="relative flex h-[4.45em] shrink-0 items-center gap-[0.9em] border-b border-(--dm-line) px-[2.2em]">
        <Icon name="chevronLeft" className="text-(--dm-text-2)" />
        <span className="text-[1.1em]">{b.title}</span>
        <Badge>Draft</Badge>
        <span className="absolute left-1/2 flex -translate-x-1/2 items-center rounded-full bg-(--dm-muted) p-[0.25em]">
          {steps.map(([icon, label]) => (
            <span
              key={label}
              className={`flex h-[2.5em] items-center gap-[0.5em] rounded-full px-[1.1em] text-[0.97em] ${
                label === "Fields" ? "bg-(--dm-card) shadow-sm" : "text-(--dm-text-2)"
              }`}
            >
              <Icon name={icon as string} />
              {label}
            </span>
          ))}
        </span>
        <span className="ml-auto flex h-[2.75em] items-center rounded-[0.75em] border border-(--dm-line) text-[0.9em]">
          <span className="flex items-center gap-[0.5em] px-[0.9em]">
            <Icon name="template" /> Save as template
          </span>
          <span className="flex h-full items-center border-l border-(--dm-line) px-[0.7em]">
            <Icon name="chevronDown" className="text-[0.85em]" />
          </span>
        </span>
        <span className="flex h-[2.75em] items-center gap-[0.5em] rounded-[0.9em] bg-(--dm-accent) px-[1.1em] text-[0.97em] text-(--dm-on-accent)">
          <Icon name="send" /> Send
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-[3.3em] shrink-0 items-center gap-[1em] border-b border-(--dm-line) px-[1.65em] text-[0.97em]">
            <Icon name="sidebar" className="text-(--dm-text-2)" />
            Page 1 of 2
            <span className="ml-auto flex items-center gap-[1em] text-(--dm-text-2)">
              <Icon name="undo" />
              <Icon name="redo" />
              <span className="h-[1.1em] w-px bg-(--dm-line)" />
              <Icon name="zoomOut" />
              <span className="flex w-[6.5em] items-center justify-between rounded-[0.9em] border border-(--dm-strong) px-[0.6em] py-[0.25em] text-(--dm-text)">
                100%
                <Icon name="updown" className="text-[0.8em]" />
              </span>
              <Icon name="zoomIn" />
              <span className="h-[1.1em] w-px bg-(--dm-line)" />
              <Icon name="rotateCcw" />
              <Icon name="rotateCw" />
              <span className="h-[1.1em] w-px bg-(--dm-line)" />
              <Icon name="search" />
              <Icon name="panel" />
              <Icon name="moreH" />
            </span>
          </div>
          <p className="flex h-[2.8em] shrink-0 items-center justify-end border-b border-(--dm-line) px-[1.1em] text-[0.82em] text-(--dm-text-2)">
            All changes saved
          </p>
          <div className="min-h-0 flex-1 overflow-hidden bg-(--dm-muted) pt-[2.4em]">
            <div className="mx-auto h-[44em] w-[52%] bg-(--dm-paper) px-[7.5%] pt-[6%] text-(--dm-paper-ink) shadow-sm">
              <p className="text-[1.2em] font-bold tracking-[-0.01em]">{b.heading}</p>
              {b.sections.map(([h, t]) => (
                <div key={h} className="mt-[1.2em]">
                  <p className="text-[0.82em] font-bold">{h}</p>
                  <p className="mt-[0.25em] text-[0.7em] leading-[1.55]">{t}</p>
                </div>
              ))}
              <p className="mt-[1.2em] text-[0.82em] font-bold">5. Signatures</p>
              <p className="mt-[0.25em] text-[0.7em]">Signed by the directors:</p>
              <p className="mt-[1em] text-[0.7em] font-bold">Director</p>
              <PlacedField label="Signature" width="14em" height="2.8em" selected />
              <PlacedField label="Name" width="14em" height="1.35em" />
              <PlacedField label="Date" width="9.2em" height="1.35em" />
            </div>
          </div>
        </div>
        <div className="flex w-[20.8%] shrink-0 flex-col border-l border-(--dm-line) text-[0.97em]">
          <div className="border-b border-(--dm-line) p-[1.1em]">
            <p>Recipient</p>
            <span className="mt-[0.6em] flex h-[2.5em] items-center justify-between rounded-[0.9em] border border-(--dm-strong) px-[0.85em]">
              {sample.user.name}
              <Icon name="updown" className="text-[0.8em] text-(--dm-text-2)" />
            </span>
          </div>
          <div className="border-b border-(--dm-line) p-[1.1em]">
            <p>Add fields</p>
            <div className="mt-[0.7em] grid grid-cols-2 gap-[0.45em]">
              {tools.map(([icon, label]) => (
                <span
                  key={label}
                  className={`flex h-[2.4em] items-center gap-[0.45em] rounded-[0.75em] border px-[0.65em] text-[0.9em] ${
                    label === "Select"
                      ? "border-transparent bg-(--dm-strong)"
                      : "border-(--dm-strong)"
                  }`}
                >
                  <Icon name={icon as string} className="text-(--dm-text-2)" />
                  <span className="truncate">{label}</span>
                </span>
              ))}
            </div>
            <p className="mt-[0.7em] text-[0.8em] leading-[1.45] text-(--dm-text-2)">
              Pick a type, then click or drag on a page. Hold ⇧ to place several.
            </p>
            <span className="mt-[0.8em] flex h-[2.5em] items-center justify-center gap-[0.5em] rounded-[0.75em] border border-(--dm-line) text-[0.9em]">
              <Icon name="detect" /> Detect fields
            </span>
          </div>
          <div className="flex-1 p-[1.1em]">
            <p>Signature settings</p>
            <p className="mt-[0.6em]">Signature for {sample.user.name}, required.</p>
            <p className="mt-[0.3em] text-[0.9em] leading-[1.5] text-(--dm-text-2)">
              Placed from the AI draft, on the line the document prints, so it can&apos;t move or
              change here. To change it, start a new version of the draft.
            </p>
          </div>
          <p className="border-t border-(--dm-line) p-[1.1em] text-[0.8em] text-(--dm-text-2)">
            ←↑→↓ move · ⇧ faster · Del remove
          </p>
        </div>
      </div>
    </>
  )
}
