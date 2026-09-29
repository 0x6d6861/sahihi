# UI rules

**Strict rule: only default components from coss ui and Extend UI.** No custom primitives and no
other UI libraries. We compose; we don't restyle.

## Sources

| Library | What for | Registry | Docs |
|---|---|---|---|
| **coss ui** (`@coss/*`) | All general UI: buttons, forms, dialogs, tables, toasts, OTP… Built on **Base UI** | shadcn registry via `@coss/style` | https://coss.com/ui/docs |
| **Extend UI** (`@extend/*`) | Document UI: PDF viewer, e-signature fields, file upload, thumbnails, viewer sidebar | `https://www.extend.ai/ui/r/styles/{style}/{name}.json` | https://ui.extend.ai/ui/docs |

Install everything with `bun run ui:bootstrap` (see `scripts/bootstrap-ui.sh`). Add more later with
`/add-ui <name>` or:

```bash
cd apps/web
bunx shadcn@latest add @coss/<component>
bunx shadcn@latest add @extend/<component>
```

`components.json` must use a **Base UI style** (we use `base-nova`) so Extend installs the Base UI
variants that match coss. When the CLI asks about overwriting existing primitives, **keep yours**
(answer no). Where the registries overlap, coss wins. `apps/web` turns off `noUncheckedIndexedAccess`
for vendored Extend code, and there's one local patch in `pdf-editor-properties.tsx`. See ADR 0007
for the reinstall checklist.

## Hard rules

1. **Don't edit `components/ui/**`** or Extend's installed files. They're vendored. Compose in
   `components/app/**` or next to the page.
2. **Don't create primitives.** If coss has it, use it. If neither library has it, compose it from
   coss parts and note it in the PR (and ADR if it's substantial).
3. **Tokens only:** `bg-background`, `bg-muted`, `text-muted-foreground`, `border`, `text-destructive`,
   plus coss's extra tokens `info`, `success`, `warning` (each with `-foreground`). No hex or rgb and no
   `bg-[#…]`. Spacing and layout utilities are fine.
4. **Base UI idioms:** polymorphism with `render={<Link href="…" />}`, not `asChild`. Check the
   installed file for sub-component names (e.g. `CardPanel`, `DialogPopup`, `MenuPopup`).
5. **Icons:** whatever `iconLibrary` `components.json` sets (the coss default). Don't mix icon sets.
6. **Toasts:** `ToastProvider` (+ `AnchoredToastProvider`) wraps the app in `app/layout.tsx`. Trigger
   with `toastManager.add({ title, description, type })` from `@/components/ui/toast`. A single
   `TooltipProvider` sits inside them, so don't add another one per page.
7. **Forms:** coss `Form` + `Field`/`FieldLabel`/`FieldError` + `Input`. Validate with the **same zod
   schema** from `@sahihi/core` that the API uses, and map API `issues[]` onto fields.
8. **Accessibility:** every icon-only button has `aria-label`; dialogs have titles; don't suppress
   focus rings.

## Screen → components map

| Screen | Components |
|---|---|
| App shell | coss `Sidebar` (or Sheet on mobile), `Menu` (user/org switcher), `Avatar`, `Breadcrumb`, `Separator` |
| Auth pages | `Card`, `Form`, `Field`, `Input`, `Button`, `Alert` |
| Onboarding (create org) | `Card`, `Form`, `Field`, `Input` |
| Documents list | `Table`, `Badge`, `Pagination`, `Empty`, `Skeleton`, Extend `FileThumbnail` |
| Upload | Extend `FileUpload`, coss `Progress`, `toastManager` |
| Envelope list | `Table`, `Badge` (`ENVELOPE_STATUS_BADGE`), `Tabs` (status filter), `Input` (search) |
| New envelope / recipients | `Dialog` or page `Form`, `Field`, `Input`, `Select` (role, verification), `NumberField` (order), `Switch` (sequential), date picker = `Popover` + `Calendar` + `Button` (coss has no `date-picker` item), `Textarea` (message) |
| Prepare document | Extend `PDFEditor` (full, see configurations below), coss `AlertDialog` (confirm save as new document) |
| Field editor | Extend `PDFEditor` (view-only shell + `renderPageOverlay` field layer); coss `Toolbar`, `ToggleGroup`, `Select`, `Popover`, `Tooltip`, `Kbd`, `Checkbox` (required) |
| Envelope detail | `Tabs` (Document / Recipients / Activity), `Card`, `Badge`, `Table`, `AlertDialog` (void), `Menu` (remind, copy link) |
| Public signing | Extend `PDFViewer` (lighter; **not** `PDFEditor`) + E-Signature dialog, coss `OTPField`, `Checkbox` (consent), `Progress`, `Alert`, `Button` |
| Verify | `Card`, `Badge`, `Alert`, Extend `FileUpload` (hash locally) |
| Settings / members | `Tabs`, `Table`, `Select` (role), `Dialog` (invite) |
| Settings / webhooks | `Tabs` (settings sub-nav), `Card` per endpoint, `Switch` (active), `Menu`, `Dialog` + `CheckboxGroup` (events), `AlertDialog` (rotate/delete), `Table` + `Badge` (deliveries), `Alert` (secret shown once) |
| Templates | `Table`, `Badge` (roles), `Menu` + `Dialog`/`AlertDialog` (rename/delete), `Empty`; "Save as template" `Dialog` with `Checkbox`; use page `Card` + `Form` |

## Extend specifics

- `PDFViewer` props we rely on: `src`, `renderPageOverlay`, `onPagePointerDown/Move/Up/Cancel`,
  `onDocumentLoadSuccess`, `showUpload={false}` (always, since uploads go through our API),
  `showDownload` (false on the signing page until completion).
- It uses the standard coss `ScrollArea` (`data-slot="scroll-area-viewport"`), so no
  `resolveScrollAreaViewport` override is needed.
- `ESignatureBlock` is a demo block (only `file`). **Don't** wire data into it by editing it. Use its
  parts (signature dialog, field chips) where they're exported, and build the stateful editor in
  `components/app/` (ADR 0003).
- The viewer and editor are client-only. Load them with `next/dynamic` and `ssr: false` in a
  `"use client"` wrapper, only on the routes that need them (the editor pulls in about 20 EmbedPDF
  plugins).

### PDFEditor configurations

Use exactly one of these two. Both always set `showUpload={false}`, `persistSignatures={false}` (the
default stores signatures in localStorage, which is unsafe on shared computers) and
`onToast={(t) => toastManager.add({ title: t.message, type: t.tone })}`.

**1. Field-placement shell** (`components/app/field-editor/`):

```tsx
<PDFEditor
  src={url}
  defaultMode="view"
  showUpload={false}
  showDownload={false}
  persistSignatures={false}
  features={{ annotate: false, redact: false, forms: false, sign: false, stamps: false,
              pages: false, security: false, capture: false, attachments: false, comments: false }}
  renderPageOverlay={(p) => <FieldLayer pageNumber={p.pageNumber} />}
  onToast={…}
/>
```

- The overlay receives `{ pageNumber, pageWidth, pageHeight, scale, rotation }`. It's rendered inside
  the page's rotate wrapper, whose local frame is the page **before its own `/Rotate`** (and the
  editor always passes `rotation: 0`). Position fields with
  `rectStyle(displayedToLocalRect(rect, pageRotation))`, turn their content upright with
  `uprightContentStyle()`, and map pointers with `localToDisplayedPoint()` (all in
  `lib/field-geometry.ts`). `pageRotation` comes from `Document.pages[i].rotation`. Ignore `scale`.
  See `coordinates.md` → Overlay frame.
- The editor's shortcuts (⌘S download, Delete, ⌘A) must not clash with the field editor's. Handle
  keys on the field layer and `stopPropagation`, and test with the features off.

**2. Prepare document** (`components/app/prepare-document/`): the full editor with
`features={{ annotate: false, sign: false, stamps: false, comments: false, security: false }}` (keep
redact, pages and forms). Save with `applyRedactions()` then `getDocumentBuffer()` → upload as a new Document. The
editor lives in its own module (`prepare-editor.tsx`) loaded with `next/dynamic`, and the handle is
passed as a `handleRef` prop because `dynamic()` doesn't reliably forward refs.
Never call `download` or trust these bytes as a signed result.

**Never** use `PDFEditor`'s `sign` mode or `getDocumentBuffer()` output for signing. Signers submit
values only, and the server stamps the PDF (ADR 0004).

## Recipient colours

`RECIPIENT_COLORS[recipient.colorIndex % 5]` in `lib/constants.ts` uses theme tokens only. Use it for
field outlines in the editor and for recipient chips.
