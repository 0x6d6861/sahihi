# Product pictures: screenshots and demos

Two kinds, by size:

- **Full-page screens are real screenshots** of the Sahihi app, in light and dark, captured from a
  seeded, believable workspace: the hero frames and merged window, and each chapter's main
  picture. Never edited after capture.
- **The demo panels are coded** (`src/components/demos`): HTML recreations of single app cards,
  built to match the real UI and the same fictional workspace (`sample` in `site.ts`). They scale
  with their panel and follow the theme.

## Where they come from

`bun run --filter @sahihi/e2e showcase` (apps/e2e/showcase, run from the repo root) does it end to
end:

1. Starts its own stack: api :4200, web :3200, worker, database `sahihi_showcase_e2e` (dropped and
   recreated every run), Redis DB 13. Needs `bun run infra:up` and no `bun run dev` of the web app.
2. Seeds **Tana Freight Ltd**, a fictional Nairobi freight company: Achieng Otieno signs up and
   creates the workspace; NDA, offer letter, IT policy and board resolution are drafted from the
   starters with believable blanks (`showcase/seed.ts`), finalised and sent; signers open their
   emailed links in Mailpit and sign with drawn signatures.
3. Drafts one more NDA with the **real assistant** (`AI_MODEL` and its key, from the shell or the
   root `.env`): it fills the parties and asks its questions (`showcase/drafting.ts`); the drafting
   shot is taken while it asks one with choices. Its wording changes from run to run; answers are
   picked by what each question asks. `SHOWCASE_SKIP_AI=1` skips this and keeps the plain draft
   (blanks highlighted, assistant not started) as the drafting shot.
4. Captures each screen at 1440×900 (1.5×) in light then dark by flipping `prefers-color-scheme` on
   the same page (`showcase/shoot.ts`), and writes `src/assets/shots/<name>-{light,dark}.jpg`.

All people, companies, addresses and emails are fictional; email only reaches Mailpit. The drafting
step sends that fictional text to the model provider.

Re-run it after any UI change that shows on the site, look at every image in both themes, and
commit the changed JPEGs. `SHOWCASE_REUSE=1` reuses an api/web/worker already running on the
showcase ports (when iterating on the capture).

## How the site shows them

`src/components/shots/shots.ts` imports every pair; `Shot` renders one, filling its parent
(`object-fit: cover`, `position` for the crop). Both images are lazy and the hidden theme is
`display: none`, so only one file loads; `high` sets `fetchPriority` (never `preload`, which would
load both). Alt text lives in `site.shots`.

| Shot | Capture | On the site |
|---|---|---|
| `files` | All files | Hero merged window |
| `drafting` | Drafting editor (with the assistant asking, when it ran) | Hero frame 1, draft chapter main |
| `editor` | Envelope editor, Fields step, a field selected | Hero frame 2, send chapter main |
| `envelope` | Completed envelope page | Hero frame 3, prove chapter main |

## The coded demos

`src/components/demos/parts.tsx` holds the pieces (`DemoRoot`, `Card`, `Pill`, `Badge`, `Field`,
`Icon`, `Scrawl`); `screens.tsx` the eight demos: `QuestionsDemo`, `ProposalDemo`, `SignersDemo`,
`SigningDemo` (phone + signature dialog), `OtpDemo`, `RoutingDemo`, `VerifyDemo`, `AuditDemo`.

- Each copies one real card: open the app (or run the showcase and look at the page) and match its
  layout, wording and states. Wording that is UI chrome ("Waiting for you", "Adopt and place") may
  be written inline; the example data comes from `sample`.
- Sizes are in `em`. The demo panel (`.demo`) is a container; `.demo-root` sets the font size from
  its width (`--dm`, about 1.5 for wide panels and 2.9 for half panels), so a demo scales as one.
- Colours are the `--dm-*` palette on `.demo` (globals.css), copied from Arc's neutral tokens,
  redefined for dark. PDF paper stays white. The panel is `aria-hidden`: the caption carries the
  meaning.

## Adding a shot

1. Capture it in `apps/e2e/showcase/capture.showcase.ts` with `shoot(page, "<name>")`.
2. Add the pair to `shots.ts`, alt text to `site.shots`, and place it with `Shot`.
3. Run the showcase, then `bun run shots` for the site, and check both themes.

Keep screenshots for full pages; anything smaller is a coded demo.
