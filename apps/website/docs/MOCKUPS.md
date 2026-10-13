# Product mockups

The product UIs on the page are **HTML, not images**, so they stay sharp at any size, cost no asset weight, and can be edited like code. All of them show the same fictional app ("Larder", a recipe notebook) so the story stays continuous from section to section.

Files:
- `src/components/mockups/parts.tsx` holds the building blocks: window chrome, panels, and sample-app cards.
- `src/components/mockups/screens.tsx` holds the composed screens that sections place on the page.
- `sampleApp` in `src/content/site.ts` holds the sample app's name, heading, categories and six items.

## The scaling model (read this before editing)

1. A mockup always lives inside an element with the class **`.mockup`** (`container-type: inline-size`). `ChromeFrame` adds it, and so do demo panels.
2. A screen's root is **`<MockupRoot>`** (`.mockup-root`), which sets
   `font-size: clamp(5px, calc(var(--mk, 1.35) * 1cqw), 15px)`.
   The font size is therefore a percentage of the container's width.
3. **Every size inside a mockup is in `em`**: text (`text-[0.8em]`), padding (`p-[0.9em]`), gaps, radii, icon sizes. The whole UI scales as one unit.
4. `scale` on `MockupRoot` sets `--mk`. Use it to make a screen "read" bigger or smaller:
   - ~1.35 for a full-width window (`AppWindow`, `CanvasEditor`, `BrowserWindow`, `AgentBuildWindow`)
   - ~1.5–1.9 for wide demo panels (`CaptureDemo`, `ExplorationsDemo`, `CommentsDemo`)
   - ~2.2–2.6 for small frames and half-width panels (hero screens, `InspectDemo`, `PinDemo`, chats)

**Never use `px` or `rem` inside a mockup.** It won't scale, and it will break at mobile widths.

Nested `text-[0.6em]` multiplies with its parent. If you shrink a card with `className="text-[0.55em]"`, everything inside it shrinks too, which is the intent.

## Parts (`parts.tsx`)

| Part | What it renders |
|---|---|
| `MockupRoot` | Scaling root. Props: `scale?`, `className?` |
| `Photo` | A "food photo" built from gradients (plate on table) from `item.photo` = `[plate, rim, table]`. Aspect 4/3 by default; override with `!aspect-square` etc. |
| `MetaRow` | Category dot, category name, date |
| `SampleCard` | A sample-app card. `variant`: `photo` (default), `type`, `overlay`, `night`, `label`, `split`. `selected` adds the blue selection outline |
| `AppLogo` | The sample app's three-shape logo and name |
| `BarChart`, `FilterChips` | The "cooked this year" chart and category chips |
| `AppPage` | The sample app's main page. Props: `cards` (0–6), `chart`, `selected` (card index) |
| `TrafficLights`, `TabBar`, `UrlBar` | Desktop window chrome. `TabBar` takes `tabs[{icon?: "globe"\|"canvas", label}]`, `active` and `agent` (shows the Agent pill) |
| `Toolbar` | Floating tool pill at the bottom centre of a canvas. Its parent must be `relative` |
| `PanelLabel` | Small grey label ("Pages", "Layers") |
| `LayersPanel` | Pages and layer tree. `layers[{label, depth?, kind?: frame\|text\|comp\|img}]`, `selected` |
| `ChatBubble`, `ToolStep`, `Composer`, `AgentPanel` | Agent chat: user bubble, a tool-call row ("Edited src/…"), the message box with branch/diff, and the whole panel |
| `InspectorRow` | Label/value row for property inspectors |

## Screens (`screens.tsx`)

| Screen | Used in | Shows |
|---|---|---|
| `CanvasScreen` | Hero frame 1 | Canvas with three artboards and a toolbar |
| `BrowserScreen` | Hero frame 2 | Browser tab showing the app page |
| `AgentScreen` | Hero frame 3 | Agent chat with one planning prompt |
| `AppWindow` | Hero merged window | Tab bar, layers, canvas with the app page, and the agent panel |
| `CanvasEditor` | Canvas chapter main | Layers, two artboards with a components strip, and a component inspector |
| `ExplorationsDemo` | Canvas demo | Six card variants A–F in a grid |
| `CommentsDemo` | Canvas demo | Selected card, comment thread, and two named cursors |
| `BrowserWindow` | Browser chapter main | Browser with several tabs, the app page with chart, and a sidebar |
| `CaptureDemo` | Browser demo | Browser and canvas windows overlapping, with the captured element outlined |
| `InspectDemo` | Browser demo | Live page with a selected heading and its inspector |
| `PinDemo` | Browser demo | Pinned element comment and an agent panel replying |
| `AgentBuildWindow` | Agent chapter main | App page and an agent log of the implementation |
| `AgentBuildChat` | Agent demo | Agent implementing a button variant and opening a PR |
| `AgentDesignChat` | Agent demo | Agent producing two design directions |

## Adding a screen

1. Compose it in `screens.tsx` from parts. The root must be `<MockupRoot scale={…}>`.
2. Use only `em` sizes. Take the sample app's data from `sampleApp`, never invented inline.
3. Decide where it goes:
   - as a chapter's main mockup: add it to `mainMockup` in `FeatureChapters.tsx`
   - as a demo: add `{ node, aspect }` to `demos` in `FeatureChapters.tsx`, then add a demo with that `kind` to the chapter in `site.ts`
4. Check it at both screenshot widths. At 390px, mockup text is allowed to be too small to read (it's decorative), but nothing may overflow its panel.

## Style inside mockups

- Mockups use the `--font-ui` face (Inter) with `letter-spacing: 0`, set on `.mockup-root`.
- Literal hex colours are allowed here to imitate a real app: window greys `#e7e7e5`/`#f7f7f6`, app surface `#dddad2`, card `#fbfaf6`, selection `#3b82f6`.
- Symbols stand in for icons (`➤ + ◯ ⌕ ▢ ◇ ›`). If you swap in an icon library, keep the icons `em`-sized.

## Swapping in real screenshots

When the real product exists, a screen can become an image:

```tsx
<ChromeFrame aspect="16/10">
  <Image src="/shots/canvas.png" alt="" fill className="object-cover object-top" sizes="(max-width: 1120px) 94vw, 1120px" />
</ChromeFrame>
```

Use an empty `alt` because the image is decorative. Export at 2× the largest display width (about 2240px for full-width windows). The bezel's screen is `position: relative`, so `fill` works.
