/**
 * The demo panels, coded to match the real app's cards (compare the full-page screenshots and
 * apps/e2e/showcase). Each fills a `.demo` panel and scales with it. Data comes from `sample`.
 */
import { s as settle } from "@/components/ui/settleMarks"
import { sample } from "@/content/site"
import { Badge, Card, DemoRoot, Field, Icon, Pill, Scrawl, tone } from "./parts"

/* ── Draft ─────────────────────────────────────────────────────── */

export function QuestionsDemo() {
  const q = sample.question
  return (
    <DemoRoot scale={1.55}>
      <Card at={settle(0, 100)} className="w-[26em] overflow-hidden border-(--dm-tone-0)/40">
        <div className="flex flex-col gap-[0.35em] px-[1.3em] pt-[1.1em] pb-[0.9em]">
          <div className="flex items-center gap-[0.6em] text-(--dm-text-3)">
            <Icon name="chevronLeft" className="text-[0.85em]" />
            <span className="font-mono text-[0.7em] tracking-[0.14em] uppercase">{q.index}</span>
            <Icon name="x" className="ml-auto text-[0.9em]" />
          </div>
          <p className="mt-[0.3em] text-[1.05em]">{q.text}</p>
          <p className="text-[0.75em] text-(--dm-text-3)">Fills: {q.fills}</p>
          <div className="mt-[0.5em] flex flex-col gap-[0.45em]">
            {q.options.map((o, i) => (
              <span
                key={o}
                {...settle(i, 300)}
                className="flex items-center gap-[0.9em] rounded-[0.55em] border border-(--dm-strong) px-[1em] py-[0.55em] text-[0.88em]"
              >
                <span className="text-[0.8em] text-(--dm-text-3)">{i + 1}</span>
                {o}
                <Icon name="chevronRight" className="ml-auto text-(--dm-text-3)" />
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-[0.6em] border-t border-(--dm-line) bg-(--dm-muted)/60 px-[1.3em] py-[0.9em]">
          <span className="text-[0.82em]">Or type your own answer</span>
          <span className="h-[2.3em] rounded-[0.55em] border border-(--dm-text) bg-(--dm-card)" />
          <div className="flex items-center justify-between">
            <Pill kind="ghost" className="px-[0.3em]">
              Skip
            </Pill>
            <Pill kind="disabled">
              Answer <Icon name="chevronRight" />
            </Pill>
          </div>
        </div>
      </Card>
    </DemoRoot>
  )
}

export function ProposalDemo() {
  const p = sample.proposal
  return (
    <DemoRoot scale={2.9}>
      <Card at={settle(0, 100)} className="w-[22em] p-[1.1em]">
        <div className="flex items-center justify-between gap-[0.6em]">
          <p className="text-[0.95em]">Suggested edit to {p.section}</p>
          <Badge>Waiting for you</Badge>
        </div>
        <p className="mt-[0.4em] text-[0.75em] leading-[1.45] text-(--dm-text-2)">{p.why}</p>
        <div className="mt-[0.8em] rounded-[0.6em] border border-(--dm-line) p-[0.9em] text-[0.75em] leading-[1.6]">
          <p>
            {p.title[0]}
            <ins
              {...settle(0, 560, "fade")}
              className="rounded-[0.3em] bg-(--dm-insert) no-underline"
            >
              {p.title[1]}
            </ins>
          </p>
          <p>
            {p.before}
            <del className="text-(--dm-danger)">{p.removed}</del>
            {p.kept}
            <ins
              {...settle(0, 560, "fade")}
              className="rounded-[0.3em] bg-(--dm-insert) no-underline"
            >
              {p.inserted}
            </ins>
            {p.after}
          </p>
        </div>
        <div className="mt-[0.9em] flex items-center gap-[0.4em]">
          <Pill kind="ghost" className="px-[0.2em]">
            Show in document
          </Pill>
          <Pill kind="ghost" className="ml-auto">
            Reject
          </Pill>
          <Pill kind="primary">Accept</Pill>
        </div>
      </Card>
    </DemoRoot>
  )
}

export function SignersDemo() {
  const s = sample.signer
  return (
    <DemoRoot scale={2.9}>
      <Card at={settle(0, 100)} className="w-[22em] p-[1.1em]">
        <div className="flex items-baseline justify-between">
          <p className="text-[0.95em]">For {s.party}</p>
          <span className="text-[0.75em] text-(--dm-text-2)">Remove</span>
        </div>
        <p className="text-[0.75em] text-(--dm-text-2)">Signs for {s.party}</p>
        <div className="mt-[0.8em] grid grid-cols-2 gap-[0.6em]">
          <Field label="Full name" value={s.name} />
          <Field label="Email" value={s.email} />
        </div>
        <div className="mt-[0.8em] flex items-center gap-[0.6em] text-[0.8em]">
          <span className="relative h-[1.2em] w-[2.1em] rounded-full bg-(--dm-strong)">
            <span className="absolute top-[0.15em] left-[0.15em] size-[0.9em] rounded-full bg-white" />
          </span>
          Initials on every page
        </div>
        <p className="mt-[0.8em] text-[0.8em]">Fields</p>
        <div className="mt-[0.35em] divide-y divide-(--dm-line) rounded-[0.6em] border border-(--dm-line)">
          {s.fields.map((f, i) => (
            <div
              key={f}
              {...settle(i, 300)}
              className="flex items-center gap-[0.6em] px-[0.8em] py-[0.5em] text-[0.78em]"
            >
              {f}
              <span className="ml-auto grid size-[1.1em] place-items-center rounded-[0.3em] bg-(--dm-accent) text-(--dm-on-accent)">
                <Icon name="check" className="text-[0.75em]" />
              </span>
              Required
              <Icon name="x" className="text-(--dm-text-2)" />
            </div>
          ))}
        </div>
      </Card>
    </DemoRoot>
  )
}

/* ── Send ──────────────────────────────────────────────────────── */

export function SigningDemo() {
  const o = sample.offer
  return (
    <DemoRoot scale={1.5} className="gap-[2.4em]">
      {/* The signing page on a phone, jumped to the signature field. */}
      <div
        {...settle(0, 100)}
        className="flex h-[88%] w-[15em] shrink-0 flex-col gap-[0.6em] overflow-hidden rounded-[2.2em] border-[0.4em] border-(--dm-text) bg-(--dm-bg) p-[0.7em] shadow-(--dm-shadow)"
      >
        <Card className="p-[0.9em] shadow-none">
          <p className="text-[1.05em] leading-[1.15] tracking-[-0.01em]">{o.title}</p>
          <p className="mt-[0.35em] text-[0.62em] text-(--dm-text-2)">
            {o.from} asked you to sign {o.file}.
          </p>
        </Card>
        <Card className="flex items-center gap-[0.6em] px-[0.8em] py-[0.5em] shadow-none">
          <span className="h-[0.3em] flex-1 rounded-full bg-(--dm-muted)" />
          <span className="text-[0.62em] text-(--dm-text-2)">0 of 1 required</span>
          <Pill className="px-[0.7em] py-[0.3em] text-[0.62em]">Next field</Pill>
        </Card>
        <div className="flex-1 rounded-[0.9em] bg-(--dm-paper) p-[1em] text-(--dm-paper-ink) shadow-sm">
          <p className="text-[0.55em]">{o.accept}</p>
          <p className="mt-[0.2em] text-[0.55em] font-semibold">{o.signer}</p>
          <span className="mt-[0.4em] flex h-[2em] w-[60%] items-center justify-center rounded-[0.3em] border-[0.15em] border-(--dm-tone-2) bg-[#fdf1e2] text-[0.75em] ring-[0.15em] ring-[#9a9a9a]">
            Sign *
          </span>
          <span className="mt-[0.5em] block w-[60%] rounded-full border border-dashed border-[#bdbdbd] px-[0.6em] py-[0.15em] text-[0.62em]">
            {o.signer}
          </span>
          <span className="mt-[0.35em] block w-[36%] rounded-full border border-dashed border-[#bdbdbd] px-[0.6em] py-[0.15em] text-[0.62em]">
            2026-10-13
          </span>
        </div>
      </div>

      {/* The signature dialog. */}
      <Card at={settle(0, 320)} className="hidden w-[22em] p-[1.2em] sm:block">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[0.95em]">Add your signature</p>
            <p className="mt-[0.2em] text-[0.68em] text-(--dm-text-2)">
              Your signature will be placed on the document when you finish signing.
            </p>
          </div>
          <span className="grid size-[1.8em] shrink-0 place-items-center rounded-full border border-(--dm-line)">
            <Icon name="x" className="text-[0.8em]" />
          </span>
        </div>
        <div className="mt-[0.9em] inline-flex rounded-[0.55em] bg-(--dm-muted) p-[0.2em] text-[0.75em]">
          <span className="rounded-[0.4em] bg-(--dm-card) px-[1em] py-[0.25em] text-(--dm-ink) shadow-sm">
            Draw
          </span>
          <span className="px-[1em] py-[0.25em] text-(--dm-text-2)">Type</span>
          <span className="px-[1em] py-[0.25em] text-(--dm-text-2)">Upload</span>
        </div>
        <div className="relative mt-[0.8em] h-[7.5em] rounded-[0.7em] border border-(--dm-line) bg-(--dm-paper)">
          <Scrawl className="absolute left-[16%] top-[14%] w-[66%] text-[#1a1a1a]" />
          <span className="absolute bottom-[1.6em] left-[1.2em] text-[0.7em] text-[#9a9a9a]">
            ×
          </span>
          <span className="absolute inset-x-[1.2em] bottom-[1.55em] border-t border-dashed border-[#9a9a9a]" />
          <span className="absolute bottom-[0.4em] left-[1.2em] text-[0.6em] text-[#8a8a8a]">
            {o.signer}
          </span>
        </div>
        <div className="mt-[0.7em] flex items-center gap-[0.5em]">
          {["#111111", "#1d4ed8", "#6d28d9"].map((c) => (
            <span key={c} className="size-[0.9em] rounded-full" style={{ background: c }} />
          ))}
          <span className="ml-auto text-(--dm-text-3)">
            <Icon name="undo" />
          </span>
        </div>
        <div className="mt-[0.9em] flex justify-end gap-[0.4em]">
          <Pill kind="ghost">Cancel</Pill>
          <Pill kind="primary">Adopt and place</Pill>
        </div>
      </Card>
    </DemoRoot>
  )
}

export function OtpDemo() {
  return (
    <DemoRoot scale={2.9}>
      <Card at={settle(0, 100)} className="w-[17em] p-[1.3em]">
        <p className="text-[1.4em] leading-[1.15] tracking-[-0.01em]">Verify it&apos;s you</p>
        <p className="mt-[0.4em] text-[0.75em] text-(--dm-text-2)">
          Enter the 6-digit code sent to {sample.otp.to}.
        </p>
        <p className="mt-[0.9em] text-[0.78em]">Verification code</p>
        <div className="mt-[0.4em] flex gap-[0.4em]">
          {Array.from({ length: 6 }, (_, i) => sample.otp.typed[i] ?? "").map((d, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed six slots
              key={i}
              // Typed digits appear one by one, at typing pace (slower than a list stagger).
              {...(d ? settle(0, 380 + i * 140, "pop") : {})}
              className={`grid h-[2.2em] w-[1.95em] place-items-center rounded-[0.45em] border text-[0.9em] ${
                d
                  ? "border-(--dm-text-2) bg-(--dm-muted)"
                  : i === sample.otp.typed.length
                    ? "border-(--dm-text-2)"
                    : "border-(--dm-line)"
              }`}
            >
              {d}
            </span>
          ))}
        </div>
        <Pill kind="disabled" className="mt-[0.9em] w-full py-[0.6em]">
          Verify
        </Pill>
        <p className="mt-[0.9em] text-center text-[0.75em] text-(--dm-text-3)">
          Resend code in 0:27
        </p>
      </Card>
    </DemoRoot>
  )
}

export function RoutingDemo() {
  return (
    <DemoRoot scale={2.9}>
      <Card at={settle(0, 100)} className="w-[22em] p-[1.1em]">
        <p className="text-[0.95em]">Recipients</p>
        <p className="mt-[0.2em] text-[0.72em] text-(--dm-text-2)">
          Invited step by step. Recipients on the same step sign in parallel.
        </p>
        {sample.routing.map((r, i) => (
          <div
            key={r.email}
            {...settle(i, 300)}
            className={`mt-[0.8em] ${i ? "border-t border-(--dm-line) pt-[0.8em]" : ""}`}
          >
            <div className="flex items-center gap-[0.5em] text-[0.82em]">
              <span
                className="size-[0.8em] rounded-full border-[0.15em]"
                style={{ borderColor: tone(r.tone) }}
              />
              {r.name}
              <Icon name="trash" className="ml-auto text-(--dm-text-3)" />
            </div>
            <div className="mt-[0.5em] grid grid-cols-[1.5fr_1fr] gap-[0.5em]">
              <Field value={r.email} />
              <Field value="Needs to sign" />
            </div>
            <div className="mt-[0.5em] flex items-center gap-[0.5em]">
              <span className="text-[0.75em] text-(--dm-text-2)">Signing step</span>
              <span className="flex items-center gap-[1em] rounded-[0.55em] border border-(--dm-line) px-[0.8em] py-[0.25em] text-[0.8em]">
                <span className="text-(--dm-text-3)">−</span>
                {r.step}
                <span>+</span>
              </span>
              <span className="ml-auto text-[0.72em] text-(--dm-text-2)">Email link only</span>
            </div>
          </div>
        ))}
      </Card>
    </DemoRoot>
  )
}

/* ── Prove ─────────────────────────────────────────────────────── */

export function VerifyDemo() {
  const half = (h: string) => [h.slice(0, 32), h.slice(32)]
  return (
    <DemoRoot scale={2.9} className="flex-col gap-[0.6em]">
      <Card
        at={settle(0, 500, "drop")}
        className="flex w-[22em] gap-[0.6em] px-[1em] py-[0.75em] shadow-none"
      >
        <Icon name="check" className="mt-[0.15em] text-(--dm-success)" />
        <div>
          <p className="text-[0.85em]">File verified</p>
          <p className="text-[0.68em] text-(--dm-text-2)">
            The file you checked is exactly the signed document for this certificate. It hasn&apos;t
            been changed since signing.
          </p>
        </div>
      </Card>
      <Card at={settle(0, 100)} className="w-[22em] p-[1.1em]">
        <div className="flex items-center gap-[0.5em]">
          <p className="text-[1.15em] tracking-[-0.01em]">{sample.nda}</p>
          <Badge kind="success">Verified</Badge>
        </div>
        <p className="mt-[0.2em] text-[0.72em] text-(--dm-text-2)">
          {sample.workspace} · completed {sample.completed}
        </p>
        <div className="mt-[0.6em] flex flex-col gap-[0.15em] text-[0.7em]">
          {sample.signers.map((s) => (
            <p key={s.name} className="truncate">
              {s.name} <span className="text-(--dm-text-2)">{s.masked}</span>
            </p>
          ))}
        </div>
        <p className="mt-[0.7em] text-[0.75em]">{sample.ndaFile}</p>
        <div className="mt-[0.2em] font-mono text-[0.55em] leading-[1.5] text-(--dm-text-2)">
          <p>Original SHA-256: {half(sample.originalSha256)[0]}</p>
          <p>{half(sample.originalSha256)[1]}</p>
          <p>Signed SHA-256: {half(sample.signedSha256)[0]}</p>
          <p>{half(sample.signedSha256)[1]}</p>
        </div>
      </Card>
    </DemoRoot>
  )
}

export function AuditDemo() {
  const total = 13
  return (
    <DemoRoot scale={2.9}>
      <Card at={settle(0, 100)} className="w-[22em] p-[1.1em]">
        <div className="flex items-baseline justify-between">
          <p className="text-[0.9em]">Today</p>
          <span className="text-[0.72em] text-(--dm-text-3)">{total} updates</span>
        </div>
        <div className="mt-[0.6em] flex flex-col">
          {sample.activity.map((e, i) => {
            const done = e.kind === "seal" || e.kind === "sign"
            return (
              <div key={e.text} {...settle(i, 260)} className="flex gap-[0.7em]">
                <div className="flex flex-col items-center">
                  <span
                    className={`grid size-[1.7em] shrink-0 place-items-center rounded-full border text-[0.8em] ${
                      done
                        ? "border-(--dm-success)/30 bg-(--dm-success-bg) text-(--dm-success)"
                        : "border-(--dm-line) text-(--dm-text-2)"
                    }`}
                  >
                    <Icon name={e.kind} className="text-[0.85em]" />
                  </span>
                  {i < sample.activity.length - 1 && (
                    <span className="w-px flex-1 bg-(--dm-line)" />
                  )}
                </div>
                <div className="min-w-0 flex-1 pb-[0.55em]">
                  <p className="truncate text-[0.78em]">{e.text}</p>
                  <p className="text-[0.65em] text-(--dm-text-3)">Event {total - i}</p>
                </div>
                <span className="text-[0.68em] text-(--dm-text-3)">{e.time}</span>
              </div>
            )
          })}
        </div>
      </Card>
    </DemoRoot>
  )
}
