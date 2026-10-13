import type { ReactNode } from "react"
import { MetalDefs, MetalIcon, type MetalIconName } from "@/components/icons/MetalIcons"
import {
  AgentBuildChat,
  AgentBuildWindow,
  AgentDesignChat,
  BrowserWindow,
  CanvasEditor,
  CaptureDemo,
  CommentsDemo,
  ExplorationsDemo,
  InspectDemo,
  PinDemo,
} from "@/components/mockups/screens"
import { Caption } from "@/components/ui/Caption"
import { ChromeFrame } from "@/components/ui/ChromeFrame"
import { Reveal } from "@/components/ui/Reveal"
import { Inset, Section } from "@/components/ui/Section"
import { site } from "@/content/site"

const mainMockup: Record<string, ReactNode> = {
  canvas: <CanvasEditor />,
  browser: <BrowserWindow />,
  agent: <AgentBuildWindow />,
}

/** Demo kind → mockup and its panel aspect ratio. */
const demos: Record<string, { node: ReactNode; aspect: string }> = {
  explorations: { node: <ExplorationsDemo />, aspect: "16/9" },
  comments: { node: <CommentsDemo />, aspect: "16/9" },
  capture: { node: <CaptureDemo />, aspect: "16/9" },
  inspect: { node: <InspectDemo />, aspect: "4/3" },
  pin: { node: <PinDemo />, aspect: "4/3" },
  "agent-build": { node: <AgentBuildChat />, aspect: "5/4.6" },
  "agent-design": { node: <AgentDesignChat />, aspect: "5/4.6" },
}

type Demo = { kind: string; lead: string; text: string; wide?: boolean }

export function FeatureChapters() {
  return (
    <>
      <MetalDefs />
      {site.chapters.map((ch) => {
        const chDemos = ch.demos as readonly Demo[]
        return (
          <Section key={ch.id} id={ch.id} className="pb-48">
            <Inset>
              <Reveal>
                <p className="text-eyebrow">{ch.eyebrow}</p>
                <h2 className="text-headline mt-3">
                  {ch.headline[0]}
                  <br />
                  {ch.headline[1]}
                </h2>
              </Reveal>
            </Inset>

            <Reveal className="mt-14">
              <ChromeFrame aspect="16/10.4">{mainMockup[ch.id]}</ChromeFrame>
            </Reveal>

            <Inset>
              <Reveal>
                <p className="text-lede mt-12 max-w-[30em] text-ink sm:px-3">{ch.body}</p>
              </Reveal>

              <div className="mt-20 grid gap-x-6 gap-y-16 sm:grid-cols-2">
                {chDemos.map((d) => (
                  <Reveal key={d.kind} className={d.wide ? "sm:col-span-2" : ""}>
                    <DemoPanel aspect={demos[d.kind].aspect}>{demos[d.kind].node}</DemoPanel>
                    <Caption lead={d.lead} text={d.text} className="mt-5 max-w-[30em] px-3" />
                  </Reveal>
                ))}
              </div>

              {"features" in ch && (
                <div className="mt-32 grid grid-cols-1 gap-x-10 gap-y-14 px-3 sm:grid-cols-2 md:grid-cols-3">
                  {ch.features.map((f, i) => (
                    <Reveal key={f.lead} delay={(i % 3) * 0.06}>
                      <MetalIcon
                        name={f.icon as MetalIconName}
                        className="size-20 -translate-x-2"
                      />
                      <p className="text-caption mt-4 font-normal text-muted">
                        <span className="font-medium text-ink">{f.lead}</span> {f.text}
                      </p>
                    </Reveal>
                  ))}
                </div>
              )}
            </Inset>
          </Section>
        )
      })}
    </>
  )
}

function DemoPanel({ aspect, children }: { aspect: string; children: ReactNode }) {
  return (
    <div className="mockup overflow-hidden rounded-[28px] bg-panel" style={{ aspectRatio: aspect }}>
      {children}
    </div>
  )
}
