# Product mockups

The product UIs on the page are **HTML, not images**, so they stay sharp at any size, cost no asset weight, follow the light/dark theme and can be edited like code. They imitate the real Sahihi web app (`apps/web`) and all show the same fictional envelope (a mutual NDA between Tana Freight Ltd and Kilima Agro Ltd), so the story stays continuous from section to section.

Files:
- `src/components/mockups/parts.tsx` holds the building blocks: app chrome, paper and fields, people and status, evidence, assistant pieces.
- `src/components/mockups/screens.tsx` holds the composed screens that sections place on the page.
- `sample` in `src/content/site.ts` holds the sample envelope: parties, recipients, sections, blanks, hashes, certificate code and events.

## The scaling model (read this before editing)

1. A mockup always lives inside an element with the class **`.mockup`** (`container-type: inline-size`). `ChromeFrame` adds it, and so do demo panels.
2. A screen's root is **`<MockupRoot>`** (`.mockup-root`), which sets
   `font-size: clamp(5px, calc(var(--mk, 1.35) * 1cqw), 15px)`.
   The font size is therefore a percentage of the container's width.
3. **Every size inside a mockup is in `em`**: text (`text-[0.8em]`), padding (`p-[0.9em]`), gaps, radii, icon sizes. The whole UI scales as one unit.
4. `scale` on `MockupRoot` sets `--mk`. Use it to make a screen "read" bigger or smaller:
   - ~1.35 for a full-width window (`AppWindow`, `DraftingWindow`, `FieldEditorWindow`, `CertificateWindow`)
   - ~1.6–1.7 for wide demo panels (`QuestionsDemo`, `SigningDemo`)
   - ~2.2–2.4 for the hero frames, 3.3 for half-width demo panels (`ProposalDemo`, `OtpDemo`, …)

**Never use `px` or `rem` inside a mockup.** It won't scale, and it will break at mobile widths.

Nested `text-[0.6em]` multiplies with its parent. If you shrink a card with `className="text-[0.55em]"`, everything inside it shrinks too, which is the intent.

## Parts (`parts.tsx`)

| Part | What it renders |
|---|---|
| `MockupRoot` | Scaling root. Props: `scale?`, `className?` |
| `TrafficLights`, `WindowBar` | Browser chrome with an address (`url`) |
| `Wordmark`, `AppTopBar` | The app's logo and top-bar navigation (`active` item), workspace name, bell, avatar |
| `PanelLabel`, `Button`, `Card`, `SettingRow` | Small grey label; pill button (`primary`); floating card; label/value row |
| `Avatar`, `StatusPill`, `RecipientRow` | Recipient initial in its colour; Signed/Viewed/Completed/Draft pill; a recipient line (`order?`, `detail?`, `status?`) |
| `TextLines`, `PdfPage` | Grey text bars; a white PDF page (`heading?`) whose children are overlays in % of the page |
| `Signature`, `FieldBox` | A one-stroke signature; a placed field (`tone`, `label`, `at: [left, top, width, height]` in %, `filled?`, `selected?`) |
| `Blank` | A blank in drafted text, dashed until `filled` |
| `HashRow`, `shortHash`, `QrCode` | Mono hash row; `9f2c4e81…0b4e72a9`; a deterministic decorative QR grid |
| `ChatBubble`, `AssistantText`, `Question`, `Composer` | Drafting assistant: user message, reply, question card (`options`, `picked`), message box |
| `toneColor(tone)` | `var(--mk-tone-N)`, the recipient colour (as `Recipient.colorIndex` in the app) |

## Screens (`screens.tsx`)

| Screen | Used in | Shows |
|---|---|---|
| `DraftScreen` | Hero frame 1 | Draft with blanks and an assistant question |
| `SendScreen` | Hero frame 2 | Signature page with fields and the field toolbar |
| `ProveScreen` | Hero frame 3 | Certificate of Completion |
| `AppWindow` | Hero merged window | A completed envelope: pages, recipients, activity, downloads |
| `DraftingWindow` | Draft chapter main | Editor with sections and blanks, assistant panel with questions |
| `QuestionsDemo` | Draft demo | Document next to a batch of three questions |
| `ProposalDemo` | Draft demo | Suggested section edit as a diff, accept/reject |
| `SignersDemo` | Draft demo | Suggested signers with their fields |
| `FieldEditorWindow` | Send chapter main | Step pill, recipients in order, field types, page with fields, field properties |
| `SigningDemo` | Send demo | Phone signing page with progress, signature dialog |
| `OtpDemo` | Send demo | Six-digit code step |
| `RoutingDemo` | Send demo | Signing order, reminders, expiry |
| `CertificateWindow` | Prove chapter main | Full certificate on the verify page with its summary |
| `VerifyDemo` | Prove demo | Drop-a-PDF verify with a match |
| `AuditDemo` | Prove demo | Hash-chained audit trail |

## Adding a screen

1. Compose it in `screens.tsx` from parts. The root must be `<MockupRoot scale={…}>`.
2. Use only `em` sizes. Take the sample data from `sample`, never invented inline.
3. Decide where it goes:
   - as a chapter's main mockup: add it to `mainMockup` in `FeatureChapters.tsx`
   - as a demo: add `{ node, aspect }` to `demos` in `FeatureChapters.tsx`, then add a demo with that `kind` to the chapter in `site.ts`
4. Check it at both screenshot widths. At 390px, mockup text is allowed to be too small to read (it's decorative), but nothing may overflow its panel.

## Style inside mockups

- Mockups use the `--font-ui` face (Inter) with `letter-spacing: 0`, set on `.mockup-root`.
- **Colours come from the mockup palette** (`--mk-*` in `globals.css`), which switches with the page theme: `bg-(--mk-surface)`, `bg-(--mk-muted)`, `border-(--mk-line)`, `text-(--mk-text-2)`, `text-(--mk-success)` and so on. Don't use the page tokens (`text-muted`, `bg-panel`) inside a screen, and don't add `dark:` variants: the palette does it.
- **Paper stays white** in both themes (`--mk-paper`, `--mk-paper-ink`, `--mk-paper-line`, `--mk-paper-text`), as `.on-paper` does in the app. Literal colours are fine on paper only (signature ink, blank highlights).
- Half-width 4/3 demos use `scale={3.3}`; wide 16/9 demos 1.6–1.7; hero frames 2.2–2.4; full windows the default 1.35.
- Symbols stand in for icons (`✓ ↓ ✆ ⌀ ◔`). If you swap in an icon library, keep the icons `em`-sized.

## Swapping in real screenshots

When the real product exists, a screen can become an image:

```tsx
<ChromeFrame aspect="16/10">
  <Image src="/shots/drafting.png" alt="" fill className="object-cover object-top" sizes="(max-width: 1120px) 94vw, 1120px" />
</ChromeFrame>
```

Use an empty `alt` because the image is decorative. Export at 2× the largest display width (about 2240px for full-width windows). The bezel's screen is `position: relative`, so `fill` works.
