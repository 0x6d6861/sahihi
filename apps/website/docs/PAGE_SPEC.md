# Page spec

The home page (`/`) is the landing page; `/security`, `/privacy` and `/terms` are MDX pages (section 11). It is composed in `src/app/page.tsx` in the order below, with one component per file in `src/components/sections/`. For each section, "Content" names the key in `site.ts` it reads.

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

- **Content:** `site.chapters[]`, one chapter per entry, in order (`draft`, `send`, `prove`)
- **Per chapter:**
  1. Eyebrow (`text-eyebrow`: 28px, faint, 500) plus a two-line `text-headline` (88px), left-aligned in the `Inset` column.
  2. The main screenshot in a `ChromeFrame` (aspect `16/10`), full `Section` width. Mapped by `ch.id` in `mainShot`: `draft → drafting`, `send → editor`, `prove → envelope`.
  3. The body paragraph: ink, weight-500 `text-lede` (28/36), max 30em.
  4. Demo panels in a 2-column grid. A demo with `wide: true` spans both columns. Each panel is `bg-panel`, radius 28px, with an aspect ratio from the `demos` map, followed by a `Caption` (`text-lede`: ink 500 lead, muted 400 rest).
  5. **Draft chapter only:** a features grid (`ch.features`) of a metal icon plus a caption-pattern line in `text-caption` (20/28). 3 columns on desktop, 2 on tablet, 1 on mobile.
- **Demo kinds** (key → coded demo in `components/demos` → panel aspect):

  | kind | demo | aspect |
  |---|---|---|
  | `questions` | `QuestionsDemo` | 16/9 |
  | `proposal` | `ProposalDemo` | 4/3 |
  | `signers` | `SignersDemo` | 4/3 |
  | `signing` | `SigningDemo` | 16/9 |
  | `otp` | `OtpDemo` | 4/3 |
  | `routing` | `RoutingDemo` | 4/3 |
  | `verify` | `VerifyDemo` | 4/3 |
  | `audit` | `AuditDemo` | 4/3 |

  To add a kind: build it in `components/demos` to match the real card (SCREENSHOTS.md), register it in `demos`, then reference it from `site.ts`.
- **Accept:** every demo panel shows a legible demo at desktop width, in both themes, with nothing overflowing at 390px. Captions align with the panel's inner edge (`px-3`). The chapter anchors (`#draft`, `#send`, `#prove`) work.

## 5. Integrations: `ContextRow.tsx`

- **Content:** `site.context`
- **Layout:** a `text-lede` headline (28px, ink, 500, the same size as body copy, as on subframe.com) in the `Inset` column. Below it, four cards sit in a wider `max-w-[1000px]` grid: 1 column on mobile, 2 on tablet, 4 on large screens. Each card is a 150px `bg-panel` tile (radius 24px) followed by a `text-caption` caption.
- **Card contents** (in `site.context.cards` order):
  1. Public API: `/api/v1` requests with status codes, scrolling vertically.
  2. Webhooks: event-name chips (`envelope.completed`, …), scrolling horizontally.
  3. Bulk send: CSV rows (`<Role> name,<Role> email`), scrolling vertically.
  4. Embedded signing: the iframe and `sahihi:signed` listener, scrolling vertically.
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

## 7. Trust: `Trust.tsx`

- **Content:** `site.trust` (up to 5 facts; placement repeats beyond that)
- **Layout:** a 12-column bento at `md`, positioned by the `layout` array: `[4 cols × 2 rows, 8, 8, 8, 4]`. Cards are `bg-panel` with radius 32px, text in `text-quote` (48/52 on desktop, 32/36 on mobile, 500). Put the shortest facts in slots 1 and 5 (the narrow ones).
- **Rule:** every fact must be true of the product today and checkable in the code or docs (`docs/security.md`, `docs/certificates.md`). No customer quotes until there are real ones.
- **Accept:** the grid has no holes at `md`+, and the cards stack on mobile.

## 8. Pricing: `Pricing.tsx`

- **Content:** `site.pricing`. Anchor: `#pricing`, which the nav and CTAs point to.
- **Layout:** a headline, then four `bg-panel` cards (radius 32px) in a 2×2 grid from `sm`. Payments aren't live, so the `text-price` slot shows **envelopes per month**, not a price. The plans and limits mirror `packages/core/src/workspace/billing.ts`; update both together. Each card has the plan name (`text-lede`, muted, 500), the `text-price` number (96px, weight 400) with its unit beside it (`text-lede`, muted, 400; wraps under the price when narrow), a faint-dash feature list (`text-sub`, muted, 400), and a full-width CTA pinned to the bottom. Each plan's CTA goes to its `href` (Free → sign-up, the others → the contact mailto). The `featured` plan's CTA is ink with paper text; the others are grey. A `text-caption` muted footnote follows.
- **Accept:** the CTAs in each row sit at the same height.

## 9. FAQ: `Faq.tsx` + `FaqList.tsx` (client)

- **Content:** `site.faq`
- **Layout:** a headline, then a list separated by `border-line` hairlines: each row's top border plus a closing rule after the last row. Each question is a `<button>` inside an `<h3>`, `text-sub` (24/32 on desktop, ink, 500). The plus icon is CSS: its vertical bar scales to 0 when open (`[data-open] .faq-plus-v`, 200ms ease-out). Answers are `text-caption` muted 400, max 36em. Several items can be open at once.
- **Behaviour:** this is not a native `<details>`. Animating `<details>` smoothly needs a height animation, which is banned, and without one the rows below jumped the full answer height in one frame. Instead heights snap, and the rows below (and the closing rule) glide from their old position with Motion's `layout="position"` (a translate, 300ms, `ease-calm`). The answer fades in and drops 4px (250ms, 50ms delay); on close it fades out in 120ms while `AnimatePresence mode="popLayout"` takes it out of flow, so the rows start rising at once. With reduced motion, rows snap and the answer only fades. Keep the hairlines as top borders: a bottom border on a row would snap with its height instead of moving with the row below.
- **Accept:** each item can be toggled by keyboard (Tab, then Enter or Space), and the button reports `aria-expanded`. Opening or closing an item moves nothing in a single-frame jump.

## 10. Footer: `Footer.tsx`

- **Content:** `site.name`, `site.footer`
- **Layout:** directly after the FAQ (whose `pb-48` provides the space above it). A 14px muted row, with the same side padding as the header (20px, 48px from `md`), with the copyright on the left and links on the right, stacked on mobile. There is no closing call-to-action section; the page ends on the FAQ.
- **Accept:** the footer year comes from `site.footer.year`, not from `Date`.

## 11. MDX pages: `src/app/(legal)/`

- **Routes:** `/security`, `/privacy`, `/terms`, each a `page.mdx` with `export const metadata`. All static.
- **Layout:** `(legal)/layout.tsx` renders `Header`, one `Inset` reading column (max 36em, `pt-32 md:pt-44`) and `Footer`. Prose styles live only in `src/mdx-components.tsx` (`h1` → `text-title`, `h2` → `text-sub`, `p`/lists → `text-caption` muted, dash bullets, underlined links, `>` blockquote → `bg-panel` notice).
- **Content rules:** the security page states only what the product does today (sources: `docs/security.md`, `docs/certificates.md`, `docs/data-retention.md`). Privacy and terms are drafts and keep the "Draft, under legal review" notice until legal-reviewed text replaces them. Dates are written by hand ("Last updated …"), never computed.
- **Accept:** `bun run shots` covers each page in both themes at both widths, with no overflow.

---

## Adding a section

1. Add its copy to `site.ts` under a new key.
2. Create `src/components/sections/<Name>.tsx` as a server component. Wrap its blocks in `<Reveal>`, and use `<Section>`/`<Inset>` with `pb-48`.
3. Insert it in `src/app/page.tsx` at the right position.
4. Add a section entry to this file.
5. Run QA_CHECKLIST.md.
