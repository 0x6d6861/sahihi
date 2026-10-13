import type { CSSProperties, ReactNode } from "react"
import { Reveal } from "@/components/ui/Reveal"
import { Inset, Section } from "@/components/ui/Section"
import { site } from "@/content/site"

const keyword = "text-[#c2410c] dark:text-[#fb923c]"
const tag = "text-[#1d4ed8] dark:text-[#93c5fd]"

/** Four small cards whose contents drift past like marquees: the integration surfaces. */
export function ContextRow() {
  const [api, webhooks, bulk, embed] = site.context.cards
  return (
    <Section className="pb-48">
      <Inset>
        <Reveal>
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-3">
            <h2 className="text-lede">{site.context.headline}</h2>
            <a
              href={site.context.link.href}
              className="text-caption underline decoration-1 underline-offset-4 transition-opacity hover:opacity-60"
            >
              {site.context.link.label} →
            </a>
          </div>
        </Reveal>
      </Inset>
      {/* Wider than the Inset column so four cards keep readable 20px captions. */}
      <div className="mx-auto mt-10 grid max-w-[1000px] grid-cols-1 gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        <ContextCard lead={api.lead} text={api.text}>
          <MarqueeY duration="20s">
            {[
              ["POST", "/api/v1/documents?name=nda.pdf", "201"],
              ["POST", "/api/v1/envelopes", "201"],
              ["POST", "/api/v1/envelopes/:id/send", "200"],
              ["GET", "/api/v1/envelopes/:id", "200"],
              ["GET", "/api/v1/envelopes/:id/downloads", "200"],
              ["GET", "/api/v1/templates", "200"],
            ].map(([verb, path, code]) => (
              <p key={path} className="flex gap-2 whitespace-nowrap py-1 font-mono text-[11px]">
                <span className={verb === "POST" ? keyword : tag}>{verb}</span>
                <span className="truncate">{path}</span>
                <span className="ml-auto text-faint">{code}</span>
              </p>
            ))}
          </MarqueeY>
        </ContextCard>
        <ContextCard lead={webhooks.lead} text={webhooks.text}>
          <MarqueeX duration="30s">
            <ChipRows
              rows={[
                ["envelope.sent", "recipient.signed", "envelope.completed"],
                ["envelope.declined", "Sahihi-Signature: t=…,v1=…", "envelope.voided"],
                ["envelope.expired", "HMAC-SHA256", "retries with backoff"],
              ]}
            />
          </MarqueeX>
        </ContextCard>
        <ContextCard lead={bulk.lead} text={bulk.text}>
          <MarqueeY duration="24s">
            <pre className="font-mono text-[10.5px] leading-[1.7] text-muted">
              <span className={tag}>{site.context.csv[0]}</span>
              {"\n"}
              {site.context.csv.slice(1).join("\n")}
              {"\n"}
            </pre>
          </MarqueeY>
        </ContextCard>
        <ContextCard lead={embed.lead} text={embed.text}>
          <MarqueeY duration="26s">
            <pre className="font-mono text-[10.5px] leading-[1.6] text-muted">
              &lt;<span className={tag}>iframe</span>
              {"\n"} src=&quot;{"{"}signingUrl{"}"}&quot;
              {"\n"} title=&quot;Sign&quot;
              {"\n"}/&gt;
              {"\n"}
              {"\n"}
              <span className={keyword}>window</span>.addEventListener(
              {"\n"} &quot;message&quot;, (e) =&gt; {"{"}
              {"\n"} <span className={keyword}>if</span> (e.data.type ===
              {"\n"} &quot;sahihi:signed&quot;) done()
              {"\n"} {"}"}
              {"\n"}){"\n"}
            </pre>
          </MarqueeY>
        </ContextCard>
      </div>
    </Section>
  )
}

function ContextCard({
  lead,
  text,
  children,
}: {
  lead: string
  text: string
  children: ReactNode
}) {
  return (
    <Reveal>
      <div className="h-[150px] overflow-hidden rounded-3xl bg-panel font-normal">{children}</div>
      <p className="text-caption mt-4 px-1 font-normal text-muted">
        <span className="font-medium text-ink">{lead}</span> {text}
      </p>
    </Reveal>
  )
}

function ChipRows({ rows }: { rows: string[][] }) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static list, never reordered
        <div key={i} className="flex gap-2">
          {row.map((chip) => (
            <span
              key={chip}
              className="whitespace-nowrap rounded-full bg-white px-3 dark:bg-white/[0.08] py-1.5 text-[12px]"
            >
              {chip}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

/** Content is rendered twice so the -50% loop is seamless. */
function MarqueeX({ children, duration }: { children: ReactNode; duration: string }) {
  return (
    <div className="fade-edges-x flex h-full items-center overflow-hidden">
      <div
        className="marquee-x flex w-max gap-2"
        style={{ "--marquee-duration": duration } as CSSProperties}
      >
        <div className="flex gap-2 pr-0">{children}</div>
        <div className="flex gap-2" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  )
}

function MarqueeY({ children, duration }: { children: ReactNode; duration: string }) {
  return (
    <div className="fade-edges-y h-full overflow-hidden px-5">
      <div className="marquee-y" style={{ "--marquee-duration": duration } as CSSProperties}>
        <div className="py-2">{children}</div>
        <div className="py-2" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  )
}
