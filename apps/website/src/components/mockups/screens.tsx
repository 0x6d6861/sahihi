/**
 * Composed product screens. Each one fills its parent (a ChromeFrame screen
 * or a grey demo panel) and scales via MockupRoot.
 */
import { sampleApp } from "@/content/site"
import {
  AgentPanel,
  AppPage,
  ChatBubble,
  InspectorRow,
  LayersPanel,
  MockupRoot,
  PanelLabel,
  SampleCard,
  TabBar,
  Toolbar,
  ToolStep,
  UrlBar,
} from "./parts"

const items = sampleApp.items

const appLayers = [
  { label: "Home", kind: "frame" as const },
  { label: "Stack", depth: 1 },
  { label: "Card", depth: 2, kind: "comp" as const },
  { label: "Card", depth: 2, kind: "comp" as const },
  { label: "Card", depth: 2, kind: "comp" as const },
  { label: "Launch", kind: "frame" as const },
]

/* ── Hero / scroll story ───────────────────────────────────────── */

export function CanvasScreen() {
  return (
    <MockupRoot scale={2.2} className="relative bg-[#ececea]">
      <div className="absolute left-[4%] top-[6%] w-[52%] scale-100">
        <p className="mb-[0.3em] text-[0.6em] text-[#9b9b97]">Home</p>
        <AppPage cards={3} className="!gap-[0.8em] !p-[1em] text-[0.55em]" />
      </div>
      <div className="absolute right-[4%] top-[14%] w-[34%]">
        <p className="mb-[0.3em] text-[0.6em] text-select">Card · type</p>
        <SampleCard item={items[1]} variant="type" className="text-[0.6em]" />
      </div>
      <div className="absolute bottom-[14%] left-[24%] w-[30%]">
        <p className="mb-[0.3em] text-[0.6em] text-[#9b9b97]">Card · photo</p>
        <SampleCard item={items[0]} selected className="text-[0.6em]" />
      </div>
      <Toolbar />
    </MockupRoot>
  )
}

export function BrowserScreen() {
  return (
    <MockupRoot scale={2.2} className="flex flex-col bg-[#f7f7f6]">
      <TabBar tabs={[{ label: "localhost:3000" }]} agent={false} />
      <UrlBar url="localhost:3000/home" />
      <AppPage cards={3} className="flex-1 text-[0.7em]" />
    </MockupRoot>
  )
}

export function AgentScreen() {
  return (
    <MockupRoot scale={2.6}>
      <AgentPanel title="Plan recipe tagging">
        <ChatBubble>
          Plan a feature for tagging where each recipe came from.
          <br />
          <br />
          Read the codebase for an approach, then capture the current screens and explore a few
          designs.
        </ChatBubble>
      </AgentPanel>
    </MockupRoot>
  )
}

/** The single window the three hero frames merge into. */
export function AppWindow() {
  return (
    <MockupRoot className="flex flex-col bg-[#f4f4f2]">
      <TabBar
        tabs={[{ label: "localhost:3000" }, { icon: "canvas", label: "Canvas" }]}
        active={1}
      />
      <div className="relative flex min-h-0 flex-1 gap-[0.8em] p-[0.8em]">
        <LayersPanel
          page="Larder redesign"
          layers={appLayers}
          selected={2}
          className="hidden w-[20%] sm:flex"
        />
        <div className="relative flex flex-1 items-center justify-center rounded-[0.7em] bg-[#ebebe9]">
          <div className="w-[78%]">
            <AppPage cards={3} selected={0} className="text-[0.8em]" />
          </div>
          <Toolbar />
        </div>
        <div className="w-[30%] overflow-hidden rounded-[0.7em] sm:w-[26%]">
          <AgentPanel title="Plan recipe tagging">
            <ChatBubble>Plan a feature for tagging where each recipe came from.</ChatBubble>
            <ToolStep verb="Read" detail="src/components/Card.tsx" />
            <ToolStep verb="Captured" detail="localhost:3000/home" />
          </AgentPanel>
        </div>
      </div>
    </MockupRoot>
  )
}

/* ── Chapter 1: canvas ─────────────────────────────────────────── */

export function CanvasEditor() {
  return (
    <MockupRoot className="flex flex-col bg-[#f4f4f2]">
      <TabBar tabs={[{ icon: "canvas", label: "Larder" }]} />
      <div className="relative flex min-h-0 flex-1 gap-[0.8em] p-[0.8em]">
        <LayersPanel
          page="Larder"
          selected={6}
          className="hidden w-[20%] sm:flex"
          layers={[
            { label: "Home" },
            { label: "Launch" },
            { label: "Header", depth: 1 },
            { label: "Hero", depth: 1 },
            { label: "Copy", depth: 2 },
            { label: "Cook something good.", depth: 3, kind: "text" },
            { label: "Button", depth: 3, kind: "comp" },
            { label: "Button", depth: 3, kind: "comp" },
            { label: "Captures", depth: 2 },
            { label: "Image", depth: 3, kind: "img" },
            { label: "Footer", depth: 1 },
          ]}
        />
        <div className="relative flex flex-1 flex-col gap-[1.2em] p-[0.6em]">
          <div className="grid grid-cols-[1fr_1.5fr] gap-[1.2em]">
            <div>
              <PanelLabel>Home</PanelLabel>
              <AppPage cards={3} className="mt-[0.3em] !gap-[0.6em] !p-[0.8em] text-[0.5em]" />
            </div>
            <div>
              <p className="text-[0.75em] text-select">Launch</p>
              <div className="relative mt-[0.3em] flex aspect-[16/10] flex-col justify-center gap-[0.6em] bg-[#dddad2] p-[1.4em]">
                <p className="text-[2.1em] leading-none tracking-[-0.04em]">
                  Cook something
                  <br />
                  good.
                </p>
                <p className="text-[0.65em] text-[#6f6d66]">
                  Your notebook for recipes worth keeping.
                </p>
                <span className="w-fit rounded-[0.4em] px-[0.6em] py-[0.2em] text-[0.6em] outline outline-[0.15em] outline-[#c026d3]">
                  Start for free
                </span>
                <div className="absolute right-[6%] top-[12%] w-[30%] rotate-6 shadow-lg">
                  <SampleCard item={items[3]} className="text-[0.45em]" />
                </div>
                <div className="absolute bottom-[10%] right-[24%] w-[26%] -rotate-3 shadow-lg">
                  <SampleCard item={items[0]} className="text-[0.45em]" />
                </div>
              </div>
            </div>
          </div>
          <div>
            <PanelLabel>Components</PanelLabel>
            <div className="mt-[0.4em] flex items-start gap-[1.2em]">
              <SampleCard item={items[1]} className="w-[18%] text-[0.5em]" />
              <div className="flex gap-[0.4em]">
                {["#f8f8f7", "#2b2b2f", "#d9482b", "#2f5bd3", "#f3c13a"].map((c) => (
                  <span
                    key={c}
                    className="size-[1.4em] rounded-[0.3em] border border-black/10"
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <Toolbar />
        </div>
        <div className="hidden w-[22%] flex-col gap-[0.8em] rounded-[0.7em] bg-white p-[0.9em] sm:flex">
          <div className="flex gap-[0.6em] text-[0.75em]">
            <span className="rounded-[0.4em] bg-[#ececea] px-[0.6em] py-[0.15em]">Design</span>
            <span className="py-[0.15em] text-[#8f8f8a]">Code</span>
          </div>
          <p className="text-[0.8em]">Button</p>
          <PanelLabel>Properties</PanelLabel>
          <InspectorRow label="variant" value="primary" />
          <InspectorRow label="disabled" value="false" />
          <InspectorRow label="children" value="Start for free" />
          <InspectorRow label="size" value="medium" />
          <InspectorRow label="icon" value="None" />
          <PanelLabel>Size</PanelLabel>
          <InspectorRow label="W" value="Hug" />
          <InspectorRow label="H" value="40" />
        </div>
      </div>
    </MockupRoot>
  )
}

export function ExplorationsDemo() {
  const variants = ["photo", "type", "overlay", "label", "split", "night"] as const
  return (
    <MockupRoot scale={1.9} className="flex gap-[1em] p-[1em]">
      <LayersPanel
        page="Explorations"
        layers={variants.map((v, i) => ({ label: `${String.fromCharCode(65 + i)} · ${v}` }))}
        className="hidden w-[24%] sm:flex"
      />
      <div className="grid flex-1 grid-cols-3 content-start gap-[1em]">
        {variants.map((v, i) => (
          <div key={v}>
            <p className="mb-[0.3em] text-[0.65em] text-[#8f8f8a]">
              {String.fromCharCode(65 + i)} · {v}
            </p>
            <SampleCard item={items[i % items.length]} variant={v} className="text-[0.7em]" />
          </div>
        ))}
      </div>
    </MockupRoot>
  )
}

export function CommentsDemo() {
  return (
    <MockupRoot scale={1.9} className="relative flex items-center justify-center p-[2em]">
      <div className="flex items-start gap-[0.8em]">
        <div className="relative w-[18em]">
          <p className="mb-[0.3em] text-[0.65em] text-select">A · ship</p>
          <SampleCard item={items[0]} selected />
          <span className="absolute -right-[0.6em] top-[1.2em] grid size-[1.3em] place-items-center rounded-full bg-[#ea580c] text-[0.7em] text-white ring-2 ring-white">
            M
          </span>
          <span className="absolute -right-[2.5em] -top-[1em] rounded-[0.3em] bg-[#ea580c] px-[0.4em] text-[0.6em] text-white">
            ➤ Mara
          </span>
        </div>
        <div className="mt-[1.4em] flex w-[17em] flex-col gap-[0.6em] rounded-[0.8em] bg-white p-[0.9em] shadow-[0_0.4em_1.6em_rgb(0_0_0/0.08)]">
          <Comment who="Mara" color="#ea580c" when="2m" text="Thoughts on the new card?" />
          <Comment
            who="Theo"
            color="#16a34a"
            when="Just now"
            text="Love it — but let the photo fill the card and clamp the title to 3 lines. I'll have the agent open a PR."
          />
          <div className="h-[2.4em] rounded-[0.5em] bg-[#f3f3f1] px-[0.6em] py-[0.4em] text-[0.7em] text-[#a3a39e]">
            Reply…
          </div>
        </div>
      </div>
      <span className="absolute bottom-[22%] right-[12%] rounded-[0.3em] bg-[#16a34a] px-[0.4em] text-[0.6em] text-white">
        ➤ Theo
      </span>
      <Toolbar active={2} />
    </MockupRoot>
  )
}

function Comment({
  who,
  color,
  when,
  text,
}: {
  who: string
  color: string
  when: string
  text: string
}) {
  return (
    <div className="flex gap-[0.5em] text-[0.72em]">
      <span
        className="grid size-[1.5em] shrink-0 place-items-center rounded-full text-white"
        style={{ background: color }}
      >
        {who[0]}
      </span>
      <div>
        <p>
          {who} <span className="text-[#a3a39e]">{when}</span>
        </p>
        <p className="mt-[0.15em] leading-[1.35]">{text}</p>
      </div>
    </div>
  )
}

/* ── Chapter 2: browser ────────────────────────────────────────── */

export function BrowserWindow() {
  return (
    <MockupRoot className="flex flex-col bg-[#f7f7f6]">
      <TabBar
        tabs={[
          { label: "Moodboard – inspiration" },
          { label: "Pull requests" },
          { label: "localhost:3000" },
        ]}
        active={2}
      />
      <UrlBar url="localhost:3000/recipes" />
      <div className="relative flex min-h-0 flex-1 bg-[#dddad2]">
        <div className="hidden w-[22%] flex-col gap-[0.5em] p-[1.4em] text-[0.8em] sm:flex">
          <span className="rounded-[0.4em] bg-[#ebe8e1] px-[0.7em] py-[0.4em]">☰ All</span>
          {sampleApp.categories.map((c) => (
            <span key={c.name} className="flex items-center gap-[0.5em] px-[0.7em] text-[#6f6d66]">
              <span className="size-[0.45em] rounded-full" style={{ background: c.color }} />
              {c.name}
            </span>
          ))}
        </div>
        <AppPage cards={6} chart className="flex-1 !bg-transparent" />
        <Toolbar />
      </div>
    </MockupRoot>
  )
}

export function CaptureDemo() {
  return (
    <MockupRoot scale={1.5} className="relative p-[1.2em]">
      <div className="absolute left-[2%] top-[4%] h-[92%] w-[54%] overflow-hidden rounded-[0.7em] bg-white shadow-sm">
        <TabBar
          tabs={[{ label: "localhost:3000" }, { icon: "canvas", label: "Canvas" }]}
          agent={false}
        />
        <AppPage chart cards={2} className="!gap-[1em] text-[0.8em]" />
      </div>
      <div className="absolute right-[2%] top-[6%] h-[88%] w-[52%] overflow-hidden rounded-[0.7em] bg-[#ececea] shadow-[0_0.6em_2em_rgb(0_0_0/0.12)]">
        <TabBar
          tabs={[{ label: "localhost:3000" }, { icon: "canvas", label: "Canvas" }]}
          active={1}
          agent={false}
        />
        <div className="flex flex-col gap-[1em] p-[1.4em]">
          <div>
            <PanelLabel>Recipes / Header</PanelLabel>
            <div className="mt-[0.3em] bg-[#dddad2] p-[1em]">
              <p className="text-[2.2em] leading-none tracking-[-0.05em]">{sampleApp.heading}</p>
              <p className="mt-[0.4em] text-[0.7em] text-[#6f6d66]">{sampleApp.meta}</p>
            </div>
          </div>
          <div>
            <p className="text-[0.75em] text-select">Chart & filters</p>
            <div className="mt-[0.3em] flex flex-col gap-[0.7em] bg-[#dddad2] p-[1em] outline outline-[0.12em] outline-select">
              <p className="text-[0.75em]">
                Cooked this year <span className="text-[#8f8f8a]">2026 · 38 recipes</span>
              </p>
              <div className="text-[0.9em]">
                <AppChart />
              </div>
            </div>
          </div>
        </div>
        <Toolbar />
      </div>
    </MockupRoot>
  )
}

function AppChart() {
  return (
    <div className="flex flex-col gap-[0.6em]">
      <div className="flex h-[3.5em] items-end gap-[0.5em] border-b border-black/15">
        {[3, 5, 2, 6, 9, 4, 2, 7, 11, 5, 3, 8].map((h, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: static list, never reordered
            key={i}
            className="w-[0.22em]"
            style={{ height: `${h * 8}%`, background: i === 8 ? "#2f5bd3" : "#9d9a92" }}
          />
        ))}
      </div>
      <div className="flex gap-[0.8em] text-[0.7em]">
        <span className="rounded-full bg-[#f6f4ee] px-[0.5em]">All</span>
        {sampleApp.categories.map((c) => (
          <span key={c.name}>● {c.name}</span>
        ))}
      </div>
    </div>
  )
}

export function InspectDemo() {
  return (
    <MockupRoot scale={2.6} className="flex gap-[0.5em] p-[0.6em]">
      <div className="flex flex-1 flex-col overflow-hidden rounded-[0.6em] bg-[#dddad2]">
        <p className="bg-white py-[0.4em] text-center text-[0.65em] text-[#77777a]">
          localhost:3000/home
        </p>
        <div className="relative flex flex-1 flex-col gap-[0.6em] p-[1em]">
          <p className="text-[0.75em]">{sampleApp.name}</p>
          <p className="w-fit text-[2em] leading-[0.95] tracking-[-0.04em] outline outline-[0.08em] outline-select">
            Cook
            <br />
            something.
          </p>
          <span className="h-[0.15em] w-[3em] bg-[#d9482b]" />
          <p className="text-[0.6em] text-[#6f6d66]">Your notebook for recipes worth keeping.</p>
          <span className="absolute bottom-[0.8em] left-1/2 -translate-x-1/2 rounded-full bg-white px-[0.7em] py-[0.3em] text-[0.6em] shadow">
            1 change · <b className="font-medium">Send</b>
          </span>
        </div>
      </div>
      <div className="flex w-[44%] flex-col gap-[0.5em] rounded-[0.6em] bg-white p-[0.7em]">
        <p className="text-[0.7em]">
          span <span className="float-right rounded bg-[#eef] px-[0.3em] text-select">span</span>
        </p>
        <p className="font-mono text-[0.55em] text-[#8f8f8a]">src/components/Hero.tsx:24</p>
        <PanelLabel>Color</PanelLabel>
        <InspectorRow label="●" value="Primary Text" />
        <PanelLabel>Text</PanelLabel>
        <InspectorRow label="Font" value="Inter" />
        <InspectorRow label="Size" value="112" />
        <InspectorRow label="Tracking" value="-0.03em" />
      </div>
    </MockupRoot>
  )
}

export function PinDemo() {
  return (
    <MockupRoot scale={2.6} className="relative flex p-[0.6em]">
      <div className="relative flex-1 overflow-hidden rounded-[0.6em] bg-[#dddad2] p-[0.8em]">
        <p className="text-[1.6em] tracking-[-0.04em]">{sampleApp.heading}</p>
        <div className="relative mt-[0.4em] w-[60%]">
          <SampleCard item={items[1]} className="text-[0.75em]" />
          <span className="absolute left-[-0.4em] top-[62%] grid size-[1.2em] place-items-center rounded-full bg-select text-[0.6em] text-white">
            1
          </span>
          <span className="absolute inset-x-0 top-[58%] h-[22%] outline outline-[0.1em] outline-select" />
        </div>
      </div>
      <div className="absolute right-[3%] top-[6%] h-[88%] w-[52%] overflow-hidden rounded-[0.6em] shadow-[0_0.4em_1.6em_rgb(0_0_0/0.15)]">
        <AgentPanel title="Update card title" diff={[53, 12]}>
          <p className="ml-auto rounded-[0.5em] border border-black/10 px-[0.6em] py-[0.3em] text-[0.65em]">
            ⌖ 1 change
          </p>
          <p className="text-[0.72em] leading-[1.4]">
            I&apos;ll clamp the selected title in Card.tsx and leave the rest of the card as is.
          </p>
        </AgentPanel>
      </div>
    </MockupRoot>
  )
}

/* ── Chapter 3: agent ──────────────────────────────────────────── */

export function AgentBuildWindow() {
  return (
    <MockupRoot className="flex flex-col bg-[#f4f4f2]">
      <TabBar tabs={[{ label: "localhost:3000" }]} />
      <div className="flex min-h-0 flex-1 gap-[0.6em] p-[0.6em]">
        <div className="relative flex flex-1 flex-col overflow-hidden rounded-[0.6em]">
          <UrlBar url="localhost:3000/recipes" />
          <AppPage cards={3} className="flex-1" />
          <Toolbar />
        </div>
        <div className="w-[34%] overflow-hidden rounded-[0.6em] sm:w-[28%]">
          <AgentPanel title="Implement card design" diff={[53, 12]}>
            <ChatBubble>implement this design in a grid</ChatBubble>
            <ToolStep verb="Read canvas" detail="Recipe cards" />
            <ToolStep verb="Ran" detail="Read Card component and tokens" />
            <ToolStep verb="Edited" detail="src/components/Card.tsx" />
            <ToolStep verb="Opened" detail="localhost:3000/recipes" />
            <ToolStep verb="Screenshot" detail="localhost:3000/recipes" />
            <p className="text-[0.75em] leading-[1.4]">
              All cards now use the new layout: cover photo, three-line title, category and date.
              Checked in the browser.
            </p>
          </AgentPanel>
        </div>
      </div>
    </MockupRoot>
  )
}

export function AgentBuildChat() {
  return (
    <MockupRoot scale={2.6}>
      <AgentPanel
        title="Implement button and open PR"
        branch="feat/floating-button"
        diff={[53, 12]}
      >
        <ChatBubble>Implement this new button variant, then commit and open a PR.</ChatBubble>
        <ToolStep verb="Read component" detail="Button" />
        <ToolStep verb="Edited" detail="src/components/ui/Button.tsx" />
        <ToolStep verb="Ran" detail="Check types and build" />
        <ToolStep verb="Ran" detail="Commit, push branch, open PR" />
        <p className="text-[0.75em] leading-[1.4]">
          Added the variant and opened a PR. Tests and lint pass.
        </p>
        <p className="text-[0.75em] underline">Add Floating Button variant ↗</p>
      </AgentPanel>
    </MockupRoot>
  )
}

export function AgentDesignChat() {
  return (
    <MockupRoot scale={2.6}>
      <AgentPanel title="Explore card directions">
        <ChatBubble>Explore a photo-led and a type-led direction for this card.</ChatBubble>
        <ToolStep verb="Read design" detail="Home card" />
        <ToolStep verb="Designed" detail="2 variations in Larder" />
        <div className="grid grid-cols-2 gap-[0.5em] rounded-[0.6em] bg-[#f3f3f1] p-[0.5em]">
          <div>
            <p className="mb-[0.2em] text-[0.6em] text-[#8f8f8a]">Photo first</p>
            <SampleCard item={items[0]} className="text-[0.55em]" />
          </div>
          <div>
            <p className="mb-[0.2em] text-[0.6em] text-[#8f8f8a]">Type first</p>
            <SampleCard item={items[0]} variant="type" className="text-[0.55em]" />
          </div>
        </div>
        <p className="text-[0.75em] leading-[1.4]">
          Done. Two directions, both built from the original card.
        </p>
      </AgentPanel>
    </MockupRoot>
  )
}
