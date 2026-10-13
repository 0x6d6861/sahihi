# Design system

The page should feel like a gallery or a hardware catalogue: one neutral off-white surface, large tight type, almost no colour, and real product screenshots that sit in polished-metal frames. Colour comes only from inside the screenshots.

All tokens are defined in `src/app/globals.css`. If a value you need isn't here, add a token rather than hard-coding it in a section.

## Colour

Text colours are **black at fixed opacities**, as on subframe.com, not solid greys. The same token therefore reads correctly on the page background and on grey panels.

### Dark mode

The page follows the visitor's system setting until they press **D**, which toggles light/dark and saves the choice in `localStorage` (`theme`). D is ignored with Cmd/Ctrl/Alt held and inside form fields. With no saved choice, the page also follows live system changes. The theme lives on `<html data-theme>`, set before first paint by the inline script from `src/components/ui/themeScript.ts`; `ThemeHotkey.tsx` handles the key. The switch is instant: `[data-theme-switching]` turns off transitions for that frame, so buttons don't fade while the page snaps. There is no way back to "follow the system" except clearing site data, and the browser `theme-color` follows the system only, not the hotkey. In dark mode the text tokens become **white** at the same opacities, so every grey keeps its role. The surfaces darken as follows:

| Token | Dark value |
|---|---|
| paper | `#111111` |
| ink | `rgb(255 255 255 / 0.92)` |
| muted / faint / ghost | white at 0.55 / 0.36 / 0.19 |
| panel | `#1a1a1a` |
| pill → hover | `#242424` → `#2e2e2e` |
| pill-raised → hover | `#2a2a2a` → `#343434` |
| line | `#2a2a2a` |

Rules:
- **Demos follow the theme** through the `--dm-*` palette on `.demo` (copied from Arc's neutral tokens, redefined under `[data-theme="dark"] .demo`). Use `bg-(--dm-card)`, `text-(--dm-text-2)` and the rest inside demos, not the page tokens; PDF paper stays white.
- **Screenshots follow the theme.** Each has a light and a dark capture of the real app; `Shot` shows the one for the current theme (SCREENSHOTS.md). The bezel screen behind them is the app's page colour (`#ffffff`, `#141414` in dark).
- The chrome bezel and metal icons are unchanged; silver reads well on dark.
- `bg-ink text-paper` (the featured pricing CTA) inverts on its own. Use `hover:bg-ink/80`, not `hover:bg-black/…`.
- Any literal colour outside a screenshot needs a `dark:` variant, as on the context-card chips and code colours in `ContextRow.tsx`.
- Under `prefers-contrast: more`, the raised greys are white in dark mode too (a separate block in `globals.css`).

| Token | Value | Looks like on paper | Tailwind | Used for |
|---|---|---|---|---|
| paper | `#f9f9f9` | — | `bg-paper` | Page background, everywhere, with no exceptions (`#111111` in dark mode) |
| ink | `rgb(0 0 0 / 0.96)` | `#0a0a0a` | `text-ink` / `bg-ink` | Primary text, the one dark button (featured pricing CTA) |
| muted | `rgb(0 0 0 / 0.55)` | `#707070` | `text-muted` | Secondary text: subtitles, the grey half of captions, process lines, plan details, mono labels |
| faint | `rgb(0 0 0 / 0.36)` | `#9f9f9f` | `text-faint` | Eyebrows ("Drafting assistant"), list dashes |
| ghost | `rgb(0 0 0 / 0.19)` | `#c9c9c9` | `text-ghost` | The big "Draft. Send. Prove." stack only |
| panel | `#efefef` | — | `bg-panel` | Demo panels, quote cards, pricing cards, provider cards |
| pill | `#ebebeb` → hover `#e0e0e0` | — | `bg-pill` | Primary button |
| pill-raised | `#e3e3e3` → hover `#d9d9d9` | — | `bg-pill-raised` | A grey button on a `bg-panel` card (non-featured pricing CTA) |
| line | `#e3e3e3` | — | `border-line` | FAQ separators, the only hairlines on the page |

Rules:
- Never put a coloured background on a section.
- Never use a brand-coloured button. The primary button is grey, and only the featured pricing CTA is ink.

## Typography

There are three faces, self-hosted from npm packages and loaded with `next/font/local` in `src/app/layout.tsx` (all three are variable fonts, so any weight from 100 to 900 is available):

| Variable | Face | Role |
|---|---|---|
| `--font-display` → `font-sans` | **Geist** 400/500/600 | Everything outside the demos |
| `--font-ui` | Inter | Text inside the coded demos (`.demo-root`, weight 400), as in the app |
| `--font-mono-face` → `font-mono` | Geist Mono | Pillar labels, code |

subframe.com uses PP Neue Montreal (a licensed font) for display, PP Neue Montreal Mono for labels, and OT Neue Montreal Semi Squeezed for prices. Geist stands in for all three. To use Neue Montreal, load it with `next/font/local` into `--font-display`; the sizes below were taken from it and need no change.

### Weight

- **Ink text is medium (500).** `body` sets `font-weight: 500`, so headlines, body paragraphs, eyebrows, caption leads, nav links and buttons are all 500.
- **Grey text is regular (400).** Anything `text-muted` gets `font-normal` beside it: subtitles, the grey half of captions, process lines, plan details, FAQ answers, the footer.
- Prices are 400.
- Don't use 600/700 outside the header wordmark.

### Type scale

Sizes are **stepped, not fluid**: one size below 768px and one from 768px up, matching subframe.com's computed styles. They are defined as `@utility` classes in `globals.css`. Values below are size/line-height in px at the default 16px root. The CSS is written in `rem` (px ÷ 16) so visitors who raise their browser's default font size get larger text. Write new text sizes in `rem` too. The exception is the fixed-size context-card tiles, whose contents must keep their proportions.

| Class | Mobile | ≥ 768px | Tracking | Weight | Use |
|---|---|---|---|---|---|
| `text-display` | 48/44 | 96/88 | -0.035em | 500 | Hero h1, process headline |
| `text-headline` | 44/44 | 88/88 | -0.035em | 500 | Chapter headlines, the pillar stack |
| `text-title` | 40/40 | 64/64 | -0.035em | 500 | Trust, Pricing, FAQ headlines |
| `text-quote` | 32/36 | 48/52 | -0.03em | 500 | Trust facts |
| `text-numeral` | 112/112 | 184/184 | -0.035em | 500 | Process numbers 1–4. Keep line-height equal to font size; shorter clips the glyph |
| `text-step` | 24/28 | 28/32 | -0.06px | 500 | Process step titles |
| `text-price` | 64/64 | 96/96 | -0.035em | 400 | Plan prices |
| `text-lede` | 20/28 | 28/36 | -0.06px | context | Body paragraphs, demo captions, process steps, plan name and unit, context headline |
| `text-sub` | 18/24 | 24/32 | -0.06px | context | Hero subtitle, plan features, FAQ questions |
| `text-caption` | 17/24 | 20/28 | -0.06px | context | Feature and context-card captions, FAQ answers, pricing footnote |
| `text-eyebrow` | 24/28 | 28/32 | -0.02em | 500, faint | Label above a chapter headline |
| `text-nav` | 18/18 | 24/24 | -0.01em | 500 | Header links |
| `text-button` | 18/22 | 20/24 | -0.01em | 500 | Button and CTA labels |
| `text-label` | 14/20 mono | same | 0.18em, uppercase | 400, muted | Device labels such as "DRAFT" |

"context" in the Weight column means the class sets no weight: ink text inherits 500, and grey text adds `font-normal`.

Rules:
- **Headlines end with a period.** "Pricing." and "FAQ." do too.
- Headlines that wrap get a manual line break (copy stores them as `[line1, line2]`). Don't rely on automatic wrapping for display sizes.
- Use the scale classes. Don't add `text-[NNpx]` outside the context cards and the header wordmark; demos size in `em`.

### The caption pattern

Captions are used everywhere a demo, feature or card is described. They are one sentence with an ink, medium-weight lead phrase and grey, regular-weight supporting text, on a single line of flow:

```tsx
<Caption lead="Explore freely." text="Keep every idea, variant and state side by side." />
// → <p class="text-lede font-normal text-muted"><span class="font-medium text-ink">Explore freely.</span> Keep every…</p>
```

Smaller variants (feature grid, context cards) use the same pattern with `text-caption`.

## Layout

- **Content width:** `<Section>` gives `max-w-[1120px]` with `px-4 sm:px-8`. `<Inset>` gives a narrower `max-w-[860px]` column for headlines and copy, so text sits indented relative to the wide screenshots. This matches the original.
- **Space between sections:** `pb-48` (192px). Sections never have borders or backgrounds.
- **Wider grids:** the Process steps (`max-w-[1024px]`) and the context cards (`max-w-[1000px]`) break out of `Inset` so their larger text doesn't wrap word by word.
- **Radii:** demo and quote panels use 28–32px, buttons 16px (`rounded-2xl`), context cards 24px (`rounded-3xl`).
- **Grids:** demos use `sm:grid-cols-2`, with `wide: true` spanning both columns. Features use 1 → 2 → 3 columns. Trust facts use a 12-column bento at `md`.

## Components

| Component | File | Notes |
|---|---|---|
| `ChromeFrame` | `ui/ChromeFrame.tsx` | Brushed-chrome bezel. Props: `aspect` (screen ratio, e.g. `"16/10"`) and `className`. Children fill the screen. |
| `PillButton` | `ui/Button.tsx` | Primary action. 48px tall (52px from `md`), grey, no border, `text-button` label. |
| `ArrowLink` | `ui/Button.tsx` | Secondary action: text plus an arrow that nudges right on hover. |
| `Caption` | `ui/Caption.tsx` | The caption pattern above. |
| `Reveal` | `ui/Reveal.tsx` | One-shot fade-and-rise (12px, 450ms, `ease-calm`) when the block enters the viewport. Takes an optional `delay` for staggering. |
| `Section` / `Inset` | `ui/Section.tsx` | Content widths (see Layout). |
| `MetalIcon` / `MetalDefs` | `icons/MetalIcons.tsx` | Six SVG "steel object" icons: compass, ruler, knob, puck, loupe, slider. |

### The chrome bezel (signature element)

`.bezel` and `.bezel-screen` in `globals.css`:
- The bezel is a 150° multi-stop grey gradient (light, dark, light…) with an inset top highlight, an inset bottom shade, and a soft drop shadow.
- Padding and radius scale with the frame through `cqw`, clamped to 4–8px and 18–34px.
- The screen's radius is the bezel radius minus its padding, so the inner and outer curves stay concentric. Keep that relationship if you change either value.
- The screen has a 1px dark inner ring and a 2px light inner ring, which give the glass edge.

Use the bezel for: the hero frames, the merged window, and each chapter's main screenshot. Don't use it for demo panels; those are flat `bg-panel` rounded rectangles.

### Icons

Feature icons are metal objects, not line icons. They are 80×80 SVGs filled with shared gradients (`#mt-h`, `#mt-v`, `#mt-top`, `#mt-ring`) and a blurred contact shadow. To replace them with real 3D renders, use transparent PNG or WebP at 160×160 and keep the `size-20` box.

## Motion

| Pattern | Spec |
|---|---|
| Section entry | `Reveal`: opacity 0→1, y `distance`→0 (default 12px; Process steps use 16px), 450ms, `cubic-bezier(0.22,1,0.36,1)`, once, triggered at 10% from the bottom of the viewport. With reduced motion it fades without moving. |
| Stagger | `delay = index * 0.05–0.08s`, wrapping per row (`i % 3`). `Reveal` ignores the delay below `md` and under reduced motion: on one column each item enters alone, so a delay is only lag. |
| Hover | Buttons darken one step; the arrow moves 2px. No scale bounces, no springs. |
| Press | Buttons and the arrow link scale to 0.97 on `:active` (`active:scale-[0.97]`, 150ms ease-out). Add it to any new button. |
| Hero | The one pinned, scrubbed sequence. See HERO_ANIMATION.md. |
| Ambient | Marquees (28–36s horizontal, 18–24s vertical). CSS only, disabled for reduced motion. |

Only `transform` and `opacity` may be animated, by scroll or otherwise.

## Accessibility

- Screenshots carry real alt text (`site.shots`); the hero frames and merged window are `pointer-events-none` pictures.
- Icons are `aria-hidden`.
- Duplicated marquee content is `aria-hidden`.
- The FAQ uses `<button aria-expanded aria-controls>` inside `<h3>`, with each answer a `role="region"` labelled by its question. See PAGE_SPEC §9 for why it is not `<details>`.
- **Contrast:** `faint` (2.5:1) and `ghost` (1.6:1) are below WCAG minimums on paper, so they are for decoration and secondary marks only. Under `prefers-contrast: more`, `globals.css` raises muted/faint/ghost to 0.7/0.55/0.36. If you add a grey token, add it there too.
- **Tap targets** are at least 44px tall (`h-11`) even when the visible text is smaller, as in the header links.
- `a` and `button` have `-webkit-tap-highlight-color: transparent`. Buttons show their own press state (`active:scale-[0.97]`), so iOS's grey tap rectangle is not needed.
- Focus: buttons have a visible `focus-visible` outline in ink. Keep that on any new link or button.
- Contrast: `muted` on `paper` is about 4.7:1, which passes WCAG AA for body text. `faint` is about 2.5:1, so use it only for large text (eyebrows) and decoration. `ghost` is decorative only.
