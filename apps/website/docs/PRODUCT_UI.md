# Product UI on the site

Every picture of the product is **code**, not an image: HTML recreations of the real Sahihi app,
built to match it screen for screen, in light and dark. They stay sharp at any size, cost no image
weight, and follow the theme. They show one fictional workspace, Tana Freight Ltd (`sample` in
`src/content/site.ts`).

## What's where

`src/components/demos/`:

| File | Holds |
|---|---|
| `pages.tsx` | Full screens on a 16:10 canvas (`Screen`): `FilesScreen`, `DraftingScreen`, `EditorScreen`, `EnvelopeScreen`, plus the shared `TopBar` |
| `screens.tsx` | Single-card demos for the panels: `QuestionsDemo`, `ProposalDemo`, `SignersDemo`, `SigningDemo` (phone + signature dialog), `OtpDemo`, `RoutingDemo`, `VerifyDemo`, `AuditDemo` |
| `hero.tsx` | Illustrative screens for the hero's three small frames: `HeroDraft` (a sheet whose blanks fill in, the assistant's question), `HeroSend` (a page with each signer's field, the signing links), `HeroProve` (the certificate with its fingerprint, QR and "Verified") |
| `parts.tsx` | Pieces: `DemoRoot`, `Card`, `Pill`, `Badge`, `Field`, `Icon` (Lucide-style line icons), `Scrawl` |

| Screen | On the site |
|---|---|
| `FilesScreen` | Hero merged window |
| `DraftingScreen` | Draft chapter main |
| `EditorScreen` | Send chapter main |
| `EnvelopeScreen` | Prove chapter main |
| `HeroDraft`, `HeroSend`, `HeroProve` | Hero frames 1–3 |

## Sizing

- **Full screens:** `Screen` renders a 16:10 canvas whose `.screen-root` font size is 1% of its
  width. The app is laid out at 1440 px with 14–14.4 px text, so **an app size in px ÷ 14.4 is the
  `em` to write** (a 64 px top bar is `h-[4.45em]`, 28 px titles `text-[1.95em]`). `zoom` > 1 shows
  part of the screen larger, `focus` picks which part (fractions of the overflow).
- **Hero illustrations:** `.illus-root` is 4% of the frame's width, with no minimum, so they keep
  their proportions in the small mobile frames. They are illustrations, not the full UI: big shapes,
  few words, grey bars for body text. Keep them that way; the full UI is the merged window and the
  chapters.
- **Demos:** `.demo-root` takes its font size from the panel's width (`--dm`, about 1.5 for wide
  panels, 2.9 for half panels).
- Only `em` inside both. No `px` or `rem`.

## Colours and type

- The `--dm-*` palette on `.demo` (globals.css) copies Arc's neutral tokens from
  `apps/web/components/arc/foundation.css` and is redefined under `[data-theme="dark"] .demo`. Use
  `bg-(--dm-card)`, `border-(--dm-line)`, `text-(--dm-text-2)`, `text-(--dm-success)` and so on,
  never the page tokens. Recipient colours are `--dm-tone-0…2` (`tone(i)`).
- **PDF paper stays white** in both themes (`--dm-paper`, `--dm-paper-ink`), as in the app.
  Literal colours are fine on paper only.
- Text is Inter (`--font-ui`), the app's face, weight 400.
- Every picture is `aria-hidden`: the captions and headings carry the meaning.

## Matching the real app

Build and change these by looking at the real screens, not from memory:

1. `bun run --filter @sahihi/e2e showcase` (repo root, needs `bun run infra:up`) seeds the same
   Tana Freight workspace on its own stack (api :4200, web :3200, database
   `sahihi_showcase_e2e`, recreated every run), signs through the real signing pages, drafts with the
   real assistant (`AI_MODEL`; `SHOWCASE_SKIP_AI=1` makes no model calls), and saves light and dark
   captures of the four full screens to `apps/e2e/showcase/out/` (gitignored).
2. Compare a coded screen with its capture at the same width, both themes, and adjust.
3. Keep `sample` in step with the seed (`apps/e2e/showcase/seed.ts`): same people, companies,
   titles, dates.

UI chrome text ("Upload document", "Waiting for you") may be written inline, as the app shows it;
the example data comes from `sample`.

## Adding a picture

1. Build it in `pages.tsx` (a full screen) or `screens.tsx` (a card), from `parts.tsx`.
2. Place it: a full screen in a `ChromeFrame` with `<Screen>`; a card as a `demos` entry in
   `FeatureChapters.tsx` with a `demo` kind in `site.ts`.
3. Run `bun run shots` and look at both widths and both themes.
