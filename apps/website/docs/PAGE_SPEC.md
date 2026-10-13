# Page spec

The page has one route (`/`). It is composed in `src/app/page.tsx` in the order below, with one component per file in `src/components/sections/`. For each section, "Content" names the key in `site.ts` it reads.

Every section's acceptance criteria are judged at **1288×900** and **390×844** (the `bun run shots` viewports).

---

## 1. Header: `Header.tsx`

- **Content:** `site.name`, `site.nav`
- **Layout:** fixed, full width, 64px tall (96px from `md`), with side padding of 20px (48px from `md`). The wordmark sits on the left (22px, 26px from `md`, semibold, -0.04em) and the nav links on the right (`text-nav`: 18px, 24px from `md`, weight 500, underlined at a 7px offset, 28px apart, 40px from `md`). Each link is `h-11` (44px) tall, so it is easy to tap even though the text is 18px. Hovering a link fades it to 60%. The background is `paper` at 80% opacity with `backdrop-blur-md`, a translucent glass layer that content scrolls beneath. The blur is recomputed every frame while the hero moves under it; if the hero ever drops frames, try a solid `bg-paper` first. It used to be translucent with `backdrop-blur-md`, but the blur was recomputed every frame while the hero moved under it, and on a one-colour page it added nothing visible. `html` has `scroll-padding-top` set to the header height plus 32px, so anchor jumps land with space below the header. If you change the header height, also change the hero frames' `top-16 md:top-24`, `StaticHero`'s top padding and the scroll padding.
- **Behaviour:** always visible, with no hide-on-scroll.
- **Accept:** the header never covers the hero frames at scroll position 0, and the links fit at 390px.

## 2. Hero + scroll story: `HeroStory.tsx` (client)

- **Content:** `site.hero`, `site.cta`, `site.pillars`
- **Layout:** a 320svh-tall track with a sticky full-viewport stage. Three tilted chrome frames sit in the top half, with the headline (`text-display`), subtitle (`text-sub`, muted, 400), CTAs (`text-button`) and the "works with" line (16px, 18px from `md`, muted) below them.
- **Behaviour:** see [HERO_ANIMATION.md](HERO_ANIMATION.md). Reduced motion gets a static stack.
- **Accept:**
  - At scroll 0 the frames show their screens and are tilted, and the headline is fully visible.
  - As you scroll, the headline fades, the frames drop into its space and the labels appear.
  - Next, the frames converge and the single window fades in.
  - The faded hero buttons are not clickable.
  - There is no horizontal overflow at 390px.

## 3. Pillar intro: `PillarIntro.tsx`

- **Content:** `site.pillars`, `site.pillarIntro`, `site.cta.primary`
- **Layout:** centred. The pillar names stack as `text-headline text-ghost` (88px on desktop, black at 19%), one per line, each followed by a period. Below them is an ink, weight-500 `text-lede` paragraph (max 22em) and the primary button.
- **Accept:** reads as a single centred column. The grey stack is visibly lighter than all headlines on the page.

## 4. Feature chapters: `FeatureChapters.tsx`

- **Content:** `site.chapters[]`, one chapter per entry, in order (`canvas`, `browser`, `agent`)
- **Per chapter:**
  1. Eyebrow (`text-eyebrow`: 28px, faint, 500) plus a two-line `text-headline` (88px), left-aligned in the `Inset` column.
  2. The main mockup in a `ChromeFrame` (aspect `16/10.4`), full `Section` width. Mapped by `ch.id`: `canvas → CanvasEditor`, `browser → BrowserWindow`, `agent → AgentBuildWindow`.
  3. The body paragraph: ink, weight-500 `text-lede` (28/36), max 30em.
  4. Demo panels in a 2-column grid. A demo with `wide: true` spans both columns. Each panel is `bg-panel`, radius 28px, with an aspect ratio from the `demos` map, followed by a `Caption` (`text-lede`: ink 500 lead, muted 400 rest).
  5. **Canvas chapter only:** a features grid (`ch.features`) of a metal icon plus a caption-pattern line in `text-caption` (20/28). 3 columns on desktop, 2 on tablet, 1 on mobile.
- **Demo kinds** (key → mockup → panel aspect):

  | kind | mockup | aspect |
  |---|---|---|
  | `explorations` | `ExplorationsDemo` | 16/9 |
  | `comments` | `CommentsDemo` | 16/9 |
  | `capture` | `CaptureDemo` | 16/9 |
  | `inspect` | `InspectDemo` | 4/3 |
  | `pin` | `PinDemo` | 4/3 |
  | `agent-build` | `AgentBuildChat` | 5/4.6 |
  | `agent-design` | `AgentDesignChat` | 5/4.6 |

  To add a kind: build the screen (MOCKUPS.md), register it in `demos`, then reference it from `site.ts`.
- **Accept:** every demo panel shows a legible mockup at desktop width. Captions align with the panel's inner edge (`px-3`). The chapter anchors (`#canvas`, `#browser`, `#agent`) work.

## 5. Context row: `ContextRow.tsx`

- **Content:** `site.context`
- **Layout:** a `text-lede` headline (28px, ink, 500, the same size as body copy, as on subframe.com) in the `Inset` column. Below it, four cards sit in a wider `max-w-[1000px]` grid: 1 column on mobile, 2 on tablet, 4 on large screens. Each card is a 150px `bg-panel` tile (radius 24px) followed by a `text-caption` caption.
- **Card contents:**
  1. Selection: rows of white chips, scrolling horizontally.
  2. Designs: thumbnail chips, scrolling horizontally.
  3. Browser: a list of tool steps, scrolling vertically.
  4. Codebase: a code snippet, scrolling vertically.
- **Behaviour:** CSS marquees. The content is rendered twice and translated by -50% so the loop is seamless, the edges fade with `mask-image`, and the duplicate copy is `aria-hidden`.
- **Accept:** there are no visible seams or jumps, and nothing moves with reduced motion.

## 6. Process: `Process.tsx`

- **Content:** `site.process`
- **Layout:** a two-line `text-display` headline (96px), then an `<ol>` in a wider `max-w-[1024px]` grid. It has 2 columns from `md` (488px each at 1024, gap 48px) and 1 column below (gap 32px). The grid is flat, with **no stagger offset**.
- **Each step** is a flex row, `items-center`:
  - A `text-numeral` in a **fixed, centred box**: 128px wide and 184px tall from `md` (`md:w-32`), 80×112 on mobile (`w-20`). Line-height stays equal to font size, so nothing is clipped.
  - A 24px gap (16px on mobile), then the text block, vertically centred against the numeral. Inside it are a `text-step` title (ink, 500) and three `text-lede` lines (muted, 400).
  - Measured against subframe.com: numeral 184/184 w500, box 128×184, gap 24, title 28/32, lines 28/36, text offset ~21px from the numeral top.
- **Behaviour:** each step fades up in turn: `<Reveal distance={16} delay={i * 0.06}>`, inside the `<li>` so the list markup stays valid.
- **Accept:** the numeral's top lines up with the title and its bottom with the last line. No glyph is cut off. The steps stack 1–4 on mobile.

## 7. Testimonials: `Testimonials.tsx`

- **Content:** `site.testimonials` (up to 5 quotes; placement repeats beyond that)
- **Layout:** a 12-column bento at `md`, positioned by the `layout` array: `[4 cols × 2 rows, 8, 8, 8, 4]`. Cards are `bg-panel` with radius 32px. Quotes use `text-quote` (48/52 on desktop, 32/36 on mobile, 500), wrapped in curly quotes. There are no names or avatars.
- **Accept:** the grid has no holes at `md`+, and the cards stack on mobile.

## 8. Pricing: `Pricing.tsx`

- **Content:** `site.pricing`. Anchor: `#pricing`, which the nav and CTAs point to.
- **Layout:** a headline, then two `bg-panel` cards (radius 32px) side by side from `sm`. Each card has the plan name (`text-lede`, muted, 500), a `text-price` price (96px, weight 400) with its unit beside it (`text-lede`, muted, 400; wraps under the price when narrow), a faint-dash feature list (`text-sub`, muted, 400), and a full-width CTA pinned to the bottom. The `featured` plan's CTA is ink with paper text; the other is grey. A `text-caption` muted footnote follows.
- **Accept:** both CTAs sit at the same height.

## 9. FAQ: `Faq.tsx` + `FaqList.tsx` (client)

- **Content:** `site.faq`
- **Layout:** a headline, then a list separated by `border-line` hairlines: each row's top border plus a closing rule after the last row. Each question is a `<button>` inside an `<h3>`, `text-sub` (24/32 on desktop, ink, 500). The plus icon is CSS: its vertical bar scales to 0 when open (`[data-open] .faq-plus-v`, 200ms ease-out). Answers are `text-caption` muted 400, max 36em. Several items can be open at once.
- **Behaviour:** this is not a native `<details>`. Animating `<details>` smoothly needs a height animation, which is banned, and without one the rows below jumped the full answer height in one frame. Instead heights snap, and the rows below (and the closing rule) glide from their old position with Motion's `layout="position"` (a translate, 300ms, `ease-calm`). The answer fades in and drops 4px (250ms, 50ms delay); on close it fades out in 120ms while `AnimatePresence mode="popLayout"` takes it out of flow, so the rows start rising at once. With reduced motion, rows snap and the answer only fades. Keep the hairlines as top borders: a bottom border on a row would snap with its height instead of moving with the row below.
- **Accept:** each item can be toggled by keyboard (Tab, then Enter or Space), and the button reports `aria-expanded`. Opening or closing an item moves nothing in a single-frame jump.

## 10. Footer: `Footer.tsx`

- **Content:** `site.name`, `site.footer`
- **Layout:** directly after the FAQ (whose `pb-48` provides the space above it). A 14px muted row, with the same side padding as the header (20px, 48px from `md`), with the copyright on the left and links on the right, stacked on mobile. There is no closing call-to-action section; the page ends on the FAQ.
- **Accept:** the footer year comes from `site.footer.year`, not from `Date`.

---

## Adding a section

1. Add its copy to `site.ts` under a new key.
2. Create `src/components/sections/<Name>.tsx` as a server component. Wrap its blocks in `<Reveal>`, and use `<Section>`/`<Inset>` with `pb-48`.
3. Insert it in `src/app/page.tsx` at the right position.
4. Add a section entry to this file.
5. Run QA_CHECKLIST.md.
