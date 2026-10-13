# Build plan

The page is already built. This file has two uses:

- **Rebuilding from scratch** (another stack, or a clean re-implementation): follow Part A in order. Each step ends with a checkpoint you can verify.
- **Taking the starter forward:** pick tasks from Part B.

Read AGENTS.md, then DESIGN.md, before step 1.

---

## Part A: build order

### A1. Scaffold
- Next.js App Router, TypeScript, Tailwind v4, `motion`, bun. Remove the scaffold's demo assets.
- Add the scripts `typecheck`, `shots` (see `package.json`).
- **Checkpoint:** `bun run build` passes on an empty page.

### A2. Tokens and base styles: `globals.css`, `layout.tsx`
- Colour tokens (black at fixed opacities), the stepped type `@utility` classes, base `body` styles (weight 500), `::selection`.
- Load the fonts with `next/font/local`: Geist and Geist Mono from the `geist` package, Inter from `@fontsource-variable/inter`. Don't use `next/font/google` (see AGENTS.md, "Gotchas").
- Add `.bezel`/`.bezel-screen`, `.mockup`/`.mockup-root`, the marquee keyframes, the FAQ plus/minus, and the reduced-motion block.
- **Checkpoint:** a test page shows a `text-display` heading in Geist on `#f9f9f9`, 96px at desktop width and 48px at 390px.

### A3. Content: `src/content/site.ts`
- Fill in the full `site` and `sampleApp` objects (schema in CONTENT.md), typed with `as const`.
- **Checkpoint:** `typecheck` passes.

### A4. UI primitives: `components/ui/`
- `ChromeFrame`, `PillButton`, `ArrowLink`, `Caption`, `Reveal` (client), `Section`/`Inset`.
- **Checkpoint:** a `ChromeFrame` with a grey child looks like polished metal around glass, and its radii are concentric.

### A5. Mockup parts: `components/mockups/parts.tsx`
- Build `MockupRoot` and `Photo` first, then `SampleCard` (all variants), `AppPage`, the window chrome, `LayersPanel` and the agent-panel parts.
- **Checkpoint:** an `AppPage` inside a `ChromeFrame` scales cleanly from 1120px down to 300px wide with nothing overflowing.

### A6. Screens: `components/mockups/screens.tsx`
- Build all 14 screens listed in MOCKUPS.md.
- **Checkpoint:** render each screen in its target frame or panel aspect on a scratch page and check that it's legible at its intended size.

### A7. Static sections
Build them in page order. Each is a server component wrapped in `Reveal`s:
`Header` → `PillarIntro` → `FeatureChapters` (with `MetalIcons`) → `ContextRow` → `Process` → `Testimonials` → `Pricing` → `Faq` → `Footer`.
- **Checkpoint:** `bun run shots` passes, and each section matches its acceptance criteria in PAGE_SPEC.md.

### A8. Hero sequence: `HeroStory.tsx`
- Build `StaticHero` first; it's also the reduced-motion path.
- Then build `AnimatedHero` following HERO_ANIMATION.md: the track, the sticky stage, the frames config, the motion values, and the pointer-events handling.
- **Checkpoint:** the six in-track screenshots show the story in order, scrolling stays smooth with DevTools CPU throttling at 4×, and reduced motion shows the static stack.

### A9. Polish and QA
- Run everything in QA_CHECKLIST.md.

---

## Part B: backlog for the starter

Ordered by value. Each item has a clear finish line.

1. **Real content.** Replace the placeholder product per CONTENT.md's rebranding checklist. *Done when:* no "Atelier", "Mara" or "Theo" strings remain and the testimonials are real or removed.
2. **Real screenshots or renders.** Swap selected screens for product images (MOCKUPS.md, "Swapping in real screenshots"), and replace the SVG metal icons with 3D renders. *Done when:* LCP under 2.5s on a throttled mobile Lighthouse run.
3. **Licensed display font.** Geist stands in for subframe.com's PP Neue Montreal. To match exactly, license Neue Montreal and load it with `next/font/local` into `--font-display`; the type scale was measured from it, so no size changes are needed. *Done when:* no layout shift on load (CLS 0).
4. **Metadata and social.** Add an Open Graph image, `icons`, and a `robots`/`sitemap` route. *Done when:* the share preview renders correctly on a link debugger.
5. **Analytics on CTAs.** Track clicks on the primary and secondary CTAs and pricing. Keep it server-rendered and don't add a client component just for tracking.
6. **Dark theme (optional).** The original is light-only. If you add a dark theme, define the tokens in `@media (prefers-color-scheme: dark)` and re-tune the bezel gradient; it needs darker stops to read as metal.
7. **Mobile mockup legibility.** Below 640px, consider hiding the side panels in `AppWindow`/`CanvasEditor` (some already use `hidden sm:flex`) and raising `--mk`.
8. **Tests.** Add a Playwright spec built from `scripts/screenshots.mjs` that asserts the hero buttons are clickable at scroll 0 and not clickable at 50% of the track.
