"use client"

import { type MotionValue, motion, useScroll, useTransform } from "motion/react"
import { type ReactNode, useRef } from "react"
import { HeroDraft, HeroProve, HeroSend } from "@/components/demos/hero"
import { FilesScreen, Screen } from "@/components/demos/pages"
import { ArrowLink, PillButton } from "@/components/ui/Button"
import { ChromeFrame } from "@/components/ui/ChromeFrame"
import { useSafeReducedMotion } from "@/components/ui/useSafeReducedMotion"
import { site } from "@/content/site"

/**
 * Hero + the one pinned, scroll-scrubbed sequence on the page:
 *   0.05–0.14  headline fades (held at full strength first, so a small scroll doesn't wash it out)
 *   0.10–0.30  frames straighten and drop into the space it left, pillar labels appear
 *   0.36–0.60  frames converge and fade into the single app window
 *   0.60–1.00  hold on the merged window
 * Only transform and opacity are animated, so it stays cheap to render.
 */

const frames = [
  {
    key: "draft",
    screen: <HeroDraft />,
    aspect: "1.1/1",
    pos: "left-[7%] top-[26%] w-[32%] md:left-[14%] md:top-[12%] md:w-[25%]",
    rotate: [-8, -4],
    shift: ["0vw", "16vw"],
  },
  {
    key: "send",
    screen: <HeroSend />,
    aspect: "1.05/1",
    pos: "left-[35%] top-[16%] w-[30%] md:left-[40%] md:top-[6%] md:w-[20%]",
    rotate: [3, 1],
    shift: ["0vw", "0vw"],
  },
  {
    key: "prove",
    screen: <HeroProve />,
    aspect: "0.95/1",
    pos: "left-[61%] top-[28%] w-[32%] md:left-[62%] md:top-[15%] md:w-[21%]",
    rotate: [9, 4],
    shift: ["0vw", "-16vw"],
  },
] as const

export function HeroStory() {
  const reduce = useSafeReducedMotion()
  return reduce ? <StaticHero /> : <AnimatedHero />
}

function AnimatedHero() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] })

  // Held for the first ~5% (≈100px) so a trackpad nudge or a restored scroll position doesn't wash the headline out.
  const textOpacity = useTransform(p, [0, 0.05, 0.14], [1, 1, 0])
  const textY = useTransform(p, [0, 0.05, 0.14], [0, 0, -40])
  // Faded-out buttons must not stay clickable over the merged window.
  const textPointer = useTransform(p, (v) => (v < 0.12 ? "auto" : "none"))
  const labelOpacity = useTransform(p, [0.12, 0.2, 0.36, 0.42], [0, 1, 1, 0])
  const framesOpacity = useTransform(p, [0.48, 0.6], [1, 0])
  const framesScale = useTransform(p, [0.36, 0.6], [1, 1.25])
  const windowOpacity = useTransform(p, [0.46, 0.62], [0, 1])
  const windowScale = useTransform(p, [0.46, 0.66], [0.86, 1])

  return (
    <div ref={ref} className="relative h-[320svh]">
      <div className="sticky top-0 h-svh overflow-hidden">
        <motion.div
          style={{ opacity: framesOpacity }}
          className="pointer-events-none absolute inset-x-0 top-16 mx-auto h-[52svh] max-w-[1400px] md:top-24"
        >
          {frames.map((f) => (
            <Frame key={f.key} f={f} p={p} scale={framesScale} labelOpacity={labelOpacity} />
          ))}
        </motion.div>

        <motion.div
          style={{ opacity: windowOpacity, scale: windowScale }}
          className="pointer-events-none absolute left-1/2 top-1/2 w-[min(94vw,1120px)] -translate-x-1/2 -translate-y-[46%] will-change-transform"
        >
          <ChromeFrame aspect="16/10">
            <Screen>
              <FilesScreen />
            </Screen>
          </ChromeFrame>
        </motion.div>

        <motion.div
          style={{ opacity: textOpacity, y: textY, pointerEvents: textPointer }}
          className="absolute inset-x-0 top-[57svh] flex flex-col items-center px-4 text-center"
        >
          <HeroCopy />
        </motion.div>
      </div>
    </div>
  )
}

function Frame({
  f,
  p,
  scale,
  labelOpacity,
}: {
  f: (typeof frames)[number]
  p: MotionValue<number>
  scale: MotionValue<number>
  labelOpacity: MotionValue<number>
}) {
  const rotate = useTransform(p, [0.1, 0.3, 0.36, 0.6], [f.rotate[0], f.rotate[1], f.rotate[1], 0])
  const x = useTransform(p, [0.36, 0.6], [...f.shift])
  const y = useTransform(p, [0.1, 0.3, 0.36, 0.6], ["0svh", "12svh", "12svh", "10svh"])
  const label = site.pillars[frames.findIndex((fr) => fr.key === f.key)]

  return (
    <motion.div
      style={{ rotate, x, y, scale }}
      className={`absolute will-change-transform ${f.pos}`}
    >
      <ChromeFrame aspect={f.aspect}>{f.screen}</ChromeFrame>
      <motion.p style={{ opacity: labelOpacity }} className="text-label mt-3 text-center">
        {label}
      </motion.p>
    </motion.div>
  )
}

function HeroCopy() {
  return (
    <>
      <h1 className="text-display">
        {site.hero.headline[0]}
        <br />
        {site.hero.headline[1]}
      </h1>
      <p className="text-sub mt-4 font-normal text-muted">
        {site.hero.subtitle[0]}
        <br className="hidden sm:block" /> {site.hero.subtitle[1]}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
        <PillButton href={site.cta.primary.href}>{site.cta.primary.label}</PillButton>
        <ArrowLink href={site.cta.secondary.href}>{site.cta.secondary.label}</ArrowLink>
      </div>
      <p className="mt-5 flex items-center gap-2 text-[1rem] font-normal leading-6 text-muted md:text-[1.125rem]">
        {site.hero.worksWith}
      </p>
    </>
  )
}

/** Reduced-motion version: same content, no pinning or scrubbing. */
function StaticHero() {
  return (
    <div className="flex flex-col items-center gap-16 px-4 pb-16 pt-28 md:pt-36">
      <div className="relative h-[34vw] max-h-[420px] w-full max-w-[1100px]">
        {frames.map((f, i) => (
          <div
            key={f.key}
            className={`absolute ${f.pos.replace(/top-\[[^\]]+\]/g, "top-0")}`}
            style={{ rotate: `${f.rotate[1]}deg` }}
          >
            <ChromeFrame aspect={f.aspect}>{f.screen}</ChromeFrame>
            <p className="text-label mt-3 text-center">{site.pillars[i]}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center text-center">
        <HeroCopy />
      </div>
      <Wide>
        <ChromeFrame aspect="16/10">
          <Screen>
            <FilesScreen />
          </Screen>
        </ChromeFrame>
      </Wide>
    </div>
  )
}

function Wide({ children }: { children: ReactNode }) {
  return <div className="w-[min(94vw,1120px)]">{children}</div>
}
