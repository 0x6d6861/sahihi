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
- Load the fonts with `next/font/local`: Geist and Geist Mono from the `geist` package. Don't use `next/font/google` (see AGENTS.md, "Gotchas").
- Add `.bezel`/`.bezel-screen`, `.frame`, the marquee keyframes, the FAQ plus/minus, and the reduced-motion block.
- **Checkpoint:** a test page shows a `text-display` heading in Geist on `#f9f9f9`, 96px at desktop width and 48px at 390px.

### A3. Content: `src/content/site.ts`
- Fill in the full `site` object (schema in CONTENT.md), typed with `as const`.
- **Checkpoint:** `typecheck` passes.

### A4. UI primitives: `components/ui/`
- `ChromeFrame`, `PillButton`, `ArrowLink`, `Caption`, `Reveal` (client), `Section`/`Inset`.
- **Checkpoint:** a `ChromeFrame` with a grey child looks like polished metal around glass, and its radii are concentric.

### A5. Screenshots: `components/shots/`
- Run the showcase (`bun run --filter @sahihi/e2e showcase`) to capture `src/assets/shots/`, then build `Shot` and `shots.ts`, and the coded demos in `components/demos` (SCREENSHOTS.md).
- **Checkpoint:** a `Shot` in a `ChromeFrame` swaps to its dark capture when the theme flips, and only one image loads.

### A7. Static sections
Build them in page order. Each is a server component wrapped in `Reveal`s:
`Header` → `PillarIntro` → `FeatureChapters` (with `MetalIcons`) → `ContextRow` → `Process` → `Trust` → `Pricing` → `Faq` → `Footer`.
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

1. ~~**Real content.**~~ Done: Sahihi copy, real app screenshots, a trust section instead of invented quotes, MDX security/privacy/terms pages. Left before launch: CONTENT.md, "Before launch".
2. ~~**Real screenshots.**~~ Done: full pages are real captures, demos are coded to match (SCREENSHOTS.md). Still open: replace the SVG metal icons with 3D renders. *Done when:* LCP under 2.5s on a throttled mobile Lighthouse run.
3. **Licensed display font.** Geist stands in for subframe.com's PP Neue Montreal. To match exactly, license Neue Montreal and load it with `next/font/local` into `--font-display`; the type scale was measured from it, so no size changes are needed. *Done when:* no layout shift on load (CLS 0).
4. ~~**Metadata and social.**~~ Done: `opengraph-image.tsx`, `icon.svg`, `robots.ts`, `sitemap.ts`, `metadataBase` from `site.url`.
5. **Analytics on CTAs.** Track clicks on the primary and secondary CTAs and pricing. Keep it server-rendered and don't add a client component just for tracking.
6. **Dark theme (optional).** The original is light-only. If you add a dark theme, define the tokens in `@media (prefers-color-scheme: dark)` and re-tune the bezel gradient; it needs darker stops to read as metal.
7. **Mobile screenshot legibility.** Below 640px the full-window shots are small; consider phone-width captures for the chapter mains.
8. **Tests.** Add a Playwright spec built from `scripts/screenshots.mjs` that asserts the hero buttons are clickable at scroll 0 and not clickable at 50% of the track.
