# UI rules

**Strict rule: only default registry components.** Arc for primitives and the design tokens, coss
where Arc has nothing, Extend for document UI, shadcn/ui as the last fallback (ADR 0023). No custom
primitives and no other UI libraries. We compose; we don't restyle. Every screen works in light and
dark.

## Sources

| Library | What for | Registry | Docs |
|---|---|---|---|
| **Arc** (`@uiarc/*`) | Primitives and design tokens: buttons, inputs, select, combobox, checkbox, switch, radio group, dialog, drawer, popover, tooltip, tabs, alert, badge, empty state, skeleton, breadcrumb, pagination, avatar, progress, usage meter, metric card, OTP input, date picker, timeline, copy button, signature pad, search field, filter toolbar, dropdown menu, user menu, toast stack. CSS modules + Motion; some items use **Radix** internally | `https://uiarc.dev/r/{name}.json` → `components/arc/` | https://uiarc.dev/llms.txt, `https://uiarc.dev/components/<id>/markdown`, the `arc` skill |
| **coss ui** (`@coss/*`) | What Arc lacks: `Table`, `Sidebar`, `Separator`, `Kbd`, `Toggle`, `ScrollArea`, `Spinner`, icon-only `Button`. Built on **Base UI** | shadcn registry via `@coss/style` | https://coss.com/ui/docs |
| **Extend UI** (`@extend/*`) | Document UI: PDF viewer and editor, file upload, thumbnails, viewer sidebar | `https://www.extend.ai/ui/r/styles/{style}/{name}.json` | https://ui.extend.ai/ui/docs |
| **shadcn/ui** (no prefix) | **Last fallback**. `base-nova` style = Base UI variant | `https://ui.shadcn.com/r/styles/{style}/{name}.json` | https://ui.shadcn.com/docs |

Order of preference for app code: Arc → coss → shadcn, with Extend for document UI. Some shadcn
items are vendored because Extend depends on them (e.g. `dropdown-menu`); app code uses Arc's `DropdownMenu` for every action menu.

Install coss and Extend with `bun run ui:bootstrap` (see `scripts/bootstrap-ui.sh`). Add more with
`/add-ui <name>`. **Arc needs a style swap during install:** with `base-nova` the shadcn CLI rewrites
Radix `asChild` to Base UI `render` and breaks Arc's files, so `/add-ui` sets `components.json` to
`new-york` for the install and restores it afterwards. Pin every dependency Arc adds to an exact
version.

`components.json` must use a **Base UI style** (we use `base-nova`) so Extend installs the Base UI
variants that match coss. When the CLI asks about overwriting existing primitives, **keep yours**
(answer no). `apps/web` turns off `noUncheckedIndexedAccess` for vendored Extend code. Local patches
to re-apply after a reinstall: `spacing` in `pdf-editor-properties.tsx` (ADR 0007), `customPanels`
in `pdf-editor.tsx` (ADR 0019, lines marked `sahihi patch (ADR 0019)`), the Tailwind `accent`
mapping in `app/globals.css` (ADR 0023, lines marked `sahihi patch (ADR 0023)`), the radii in
`components/arc/user-menu/user-menu.module.css` (ADR 0027, listed in the comment at its top), and
the open action in `components/arc/notification-center/notification-center.tsx` (ADR 0030, lines
marked `sahihi patch (ADR 0030)`), and the translucent-menu block appended to Arc's `dropdown-menu`,
`select`, `popover`, `user-menu` and `command-palette` stylesheets (ADR 0059, marked
`sahihi patch (ADR 0059)`).

**Text fields (ADR 0063):** `Input`, `Textarea` and `PasswordField` come from
`@/components/app/fields` (shadcn's default input, textarea and label in `components/shadcn/`, with
Arc's props) until Arc ships a filled input. Biome refuses the Arc and shadcn paths elsewhere.

**Buttons and badges (ADR 0060):** import `Button` from `@/components/app/button`, `SplitButton`
from `@/components/app/split-button` and `Badge` from `@/components/app/badge`, never from
`components/arc/` (Biome fails the lint). They are Arc's components with the emerald primary and the
info tone kept blue; every prop is Arc's.

## Theme and tokens (ADR 0023)

- Load order: `app/globals.css` (coss) → `components/arc/foundation.css` (Arc tokens) → `app/app.css`
  (the bridge that maps coss tokens onto Arc roles, plus field-border contrast and `.on-paper`).
- Type: Inter for UI (`--font-body`, mapped to Tailwind `font-sans`), Geist for display headings
  (`--font-display` / `font-heading`), Geist Mono. Weights 400 and 500 only (`font-medium`, never
  `font-semibold`). Page titles: `text-2xl font-medium tracking-tight`.
- Palette (ADR 0058, in `app.css`): Tailwind **taupe** neutrals (Arc's `--neutral-*` ramp is
  redefined) and **emerald** as the theme colour. Status colours mean status; info stays blue.
- Radii (ADR 0058, shadcn "small"): `--radius` 0.45rem, so Tailwind gives lg 7px, xl 10px (menu
  rows), 2xl 13px, 3xl 16px (popovers). **Pill** for chips, avatars and switches; **control** (13px,
  `--radius-control`) for buttons, fields, tabs and alerts; **panel** (19px, `--radius-panel`) for
  sections, dialogs and cards. Field overlays on a PDF stay small (`rounded-sm`).
- Sizes (ADR 0058, compact): controls are 32px (`--control-height-md`), 28px small, 36px large; up
  to 640px wide they step back up to 44px for touch.
- Accent: `data-accent="emerald"` on `<html>` (a preset Arc doesn't define). Arc uses it for focus,
  selection, active tabs, progress and switches. Primary buttons are emerald-700 with white text
  (emerald-500 with dark text in dark mode); Arc's Button gets them through the app wrapper
  (ADR 0060).
- **Dark mode:** system by default; Light / Dark / System in the account menu (Arc `user-menu`),
  stored in the `sahihi-theme` cookie (`lib/theme.ts`, `components/app/theme.ts`). Dark sets both
  `.dark` (coss, Tailwind `dark:`) and `data-theme="dark"` (Arc) on `<html>`. The root layout renders
  an explicit choice on the server and runs a nonce'd script for System before first paint.
- **`.on-paper`:** anything drawn on a PDF page (field layers in the editor, preview and signing
  page) sits in this scope, which pins the light token values. Paper is white in both themes.
- Arc's CSS modules aren't in a cascade layer, so they beat Tailwind utilities that set the same
  property. Wrap an Arc component to hide or place it (`<span className="lg:hidden">…</span>`). For
  the rare override, use an inline `style` with a token (`fontFamily: "var(--font-mono)"`).

## Compositions in `components/app/`

| Part | Use |
|---|---|
| `Panel` | Titled, bordered section (page groups, forms, settings, auth cards). Arc's `Card` is a content card, not a container. Don't nest panels; inside one, separate rows with hairlines |
| `SettingsSection` (`settings/settings-section.tsx`) | A Settings section: heading (`text-lg`) and description on the page, the form or rows in a bordered card below. Same props as `Panel`; every Settings page uses it instead of `Panel` |
| `ButtonLink` | Navigation that looks like an Arc button (`variant`, `size`). Arc's Button is a `<button>` only |
| `ConfirmDialog`, `DialogActions` | A confirmation that needs explaining (delete, void, revoke, decline), with optional body (e.g. a reason `Textarea`). `onConfirm` throws to stay open |
| `toastManager` (`toast.tsx`) | Raise an Arc toast from anywhere. Background results and errors only |
| `motion.ts` (`stagger`) + motion classes in `app/app.css` | Entrances and press feedback on app-owned surfaces. See **Motion** |
| `AppProviders` | `ArcProvider` (next/link) + Arc toast stack, mounted once in the root layout |

## Hard rules

1. **Don't edit `components/ui/**`, `components/arc/**`** or Extend's installed files. They're
   vendored. Compose in `components/app/**` or next to the page.
2. **Don't create primitives.** If Arc has it, use it; then coss; then shadcn. If none has it,
   compose it from existing parts and note it in the PR (and ADR if it's substantial). Use the same
   item for the same job everywhere (one confirmation pattern, one toast, one table).
3. **Tokens only:** `bg-background`, `bg-muted`, `text-muted-foreground`, `border`,
   `text-destructive-foreground`, `info` / `success` / `warning` (each with `-foreground`). No hex or
   rgb and no `bg-[#…]`. Spacing and layout utilities are fine. Status colour means status.
4. **Two idioms.** Arc is Radix plus props: `<DialogTrigger asChild>`, `<Input label error />`,
   `<Select label options />`, `<Alert tone title />`, `<Badge tone />`, `<Button variant loading />`
   (variants `primary` | `secondary` | `ghost` | `danger`; one primary per surface). coss is Base UI:
   `render={<Link … />}`, `CardPanel`, `MenuPopup`. Open the installed file before using either.
5. **Menus:** every action menu is Arc's `DropdownMenu` (`label`, `items: { label, icon, onSelect,
   disabled, destructive, separatorBefore }[]`). Row menus use the label **Actions**. Items are one
   line and keyed by label: put an unavailable item's reason in its label and keep labels unique.
   Navigation items call `router.push` in `onSelect`.
6. **Icons:** app code uses **HugeIcons** only. Import icons from `@/components/app/icons`, which
   exports HugeIcons glyphs as components (16px by default, the size Arc controls expect); add new
   ones there. The app shell may use `<HugeiconsIcon icon={…} size={16} />` directly. Never import
   `lucide-react` in app code. Vendored `components/ui/**`, `components/arc/**` and
   `components/extend/**` keep their own icons (lucide).
7. **Feedback:** a foreground action confirms **in place**: the button's `loading` state, then its
   new label or the dialog's next view ("Saved", "Template saved"). Toasts (`toastManager.add({
   title, description, type })` from `@/components/app/toast`) are for background results and
   errors. A single coss `TooltipProvider` stays in the root layout for coss tooltips.
8. **Forms:** a native `<form noValidate>` with Arc fields; each field gets its message through
   `error={errors["path"]}`. Validate with the **same zod schema** from `@sahihi/core` that the API
   uses, and map zod or API `issues[]` with `issuesToFormErrors` (`lib/envelope-form.ts`).
9. **Accessibility:** every icon-only button has `aria-label`; dialogs have titles (Arc's
   `DialogContent title` is required); don't suppress focus rings (Arc draws a keyboard-only ring).
   Colours must keep the contrast below, in both themes.
10. **Dates:** format with `formatDate`, `formatDateTime`, `formatDayMonth` or `formatLocalDate` from
   `@/lib/format` (en-GB, Nairobi time). Never call `toLocaleDateString()` or create an
   `Intl.DateTimeFormat` in a page: the server's locale would leak into the UI.
11. **Statuses:** show statuses through the badge maps in `@/lib/constants`
    (`ENVELOPE_STATUS_BADGE`, `DOCUMENT_STATUS_BADGE`, `RECIPIENT_STATUS_BADGE`), never the raw enum.
12. **Descriptions earn their place.** No subtitle under a page title, panel or section that
   restates the heading or explains the obvious ("Devices where you're signed in"). Keep a line
   only when it carries a fact people need: a consequence, a limit, a format, a legal note, or
   metadata (counts, dates, signing order). Confirmation dialogs always say what happens.
13. **Route states:** `app/(app)/loading.tsx`, `error.tsx` and `not-found.tsx` (shared parts in
    `components/app/route-states.tsx`) cover every app page; root `app/error.tsx` and
    `app/not-found.tsx` cover auth, signing and verify. Add a page-specific `loading.tsx` when the
    generic skeleton doesn't fit. In Next 16 the error boundary's prop is `retry`, not `reset`.
14. **Tables:** every row is one line. Never stack a second line in a cell (an email under a name,
    a description under a title); give it its own column, hidden on narrow screens
    (`max-md:hidden` / `max-lg:hidden`) and truncated with the full text in `title`. Badges in a
    cell don't wrap: show a few and a "+N" with a tooltip.

### Colour contrast

Colours come from Arc's tokens, bridged in `app/app.css`. They are checked against WCAG 2.2 AA;
re-check with an OKLCH contrast calculator before changing one.

| Pair | Light | Dark | Needs |
|---|---|---|---|
| `foreground` on `background` | 19.8:1 | 19.0:1 | 4.5:1 |
| `muted-foreground` on `background` / on the canvas / on `muted` | 7.9 / 7.6 / 7.0 | 7.8 / 6.9 (card) / 6.0 | 4.5:1 |
| White on `destructive` (solid danger fill) | 5.6 | 5.6 | 4.5:1 |
| `destructive-foreground` / `success-foreground` / `warning-foreground` / `info-foreground` on `background` | 5.6 / 5.5 / 6.2 / 6.6 | 7.0 / 9.9 / 10.7 / 9.2 | 4.5:1 |
| `primary-foreground` on `primary` (emerald primary button) | 5.4 | 6.1 | 4.5:1 |
| `accent-strong` text on the page (selected rows, links) | 7.6 | 13.0 | 4.5:1 |
| `input` / `--border-strong` (field edges) against `background` / `muted` | 5.0 / 4.4 | 4.0 / 3.6 (card) | 3:1 (1.4.11) |
| Switch/checkbox fill (`--control-on`) against its surface | 3.7 | 5.4 | 3:1 |

Arc's default field edge (`--border-strong`) is only 1.75:1, so `app.css` sets it to taupe-500
(`--neutral-7`), which clears 3:1 on every surface in both themes. Card and divider `border`s are
decorative and may stay lighter. Values measured from the OKLCH tokens in `app.css` (ADR 0058).

### Surfaces and shadows (ADR 0051)

- **Canvas.** In light mode Arc's page, cards and raised layers are all white, so the app shell paints
  its page area with `--canvas` (taupe-50, the `.app-canvas` class in `app.css`) and
  `Panel`s, tables and folder cards stay white on it. `--background` stays white (fields, the top
  bar, public pages). Grey fills (`--surface-muted` / `bg-muted`) are one step darker in light mode
  (`--neutral-3`) so search fields, tiles and tracks still read on the canvas. In dark mode the canvas
  is the background: Arc's dark surfaces are layered already. The paper (`.on-paper`) is unchanged.
- **Shadows come from Arc's three levels only**, as `shadow-(--shadow-…)`, never Tailwind's
  `shadow-sm` / `shadow-lg` (too faint in dark mode):
  - `--shadow-resting`: the active item of `PillNav`, the stack behind a dragged item.
  - `--shadow-raised`: the top bar once the page scrolls under it; a waiting question card in the
    drafting chat; file cards, folder cards and Drafting tiles on hover, only where hover is real
    (`[@media(hover:hover)]:`).
  - `--shadow-floating`: things over the page: the selection bar, the drag chip and the drop hint.
  - Panels have no shadow: they rest on a border (Arc's composition rule).
- **Unread** is one colour: the Inbox count and the unread dot in Notifications are both info blue.
  Green and amber mean status.

## Screen → components map

Arc unless marked coss or Extend.

| Screen | Components |
|---|---|
| App shell | Top bar (ADR 0026): logo and workspace menu on the left edge, avatar on the right edge, and from `md` a grid whose side columns are as wide as `<main>`'s margins (never narrower than their contents), so the pill lines up with the page title from ~1700px (narrower, it follows the workspace menu) and the search field ends on the content's right edge from ~1280px. Sahihi mark (`LogoMark` in `components/app/logo.tsx`, the website's ※ in the text colour; `app/icon.svg` is the tab icon; the auth pages show it too) + Arc `DropdownMenu` workspace menu (check on the current one; then Workspace settings, Members, Plan & usage (ADR 0054); "New workspace") on the left, then All files / Drafting / Inbox as a segmented pill (ADR 0041; document, envelope, template and bulk-send pages light up All files or Inbox, the AI document pages Drafting, `isNavActive`) (`PillNav`, shared with the draft editor's steps) (`bg-muted` track, raised `bg-background` active pill gliding with Motion `layoutId`, instant with reduced motion; own full-width row below `md`, labels only below `sm`); an Arc `Badge` with the unread count on the Inbox item (`UnreadCountProvider`, docs/notifications.md); global search in the middle (ADR 0056: a search-field-shaped trigger with a coss `Kbd` ⌘K, and ⌘K / Ctrl+K anywhere, open Arc's `CommandPalette` as a dialog (coss `DialogPopup` with its frame, title bar and close button removed, so the palette's own card is the dialog; Escape clears a query, then closes; focus returns to the field): Create, Go to and Settings rows always, the workspace's folders, documents, envelopes, templates and drafts once something is typed, then "Search All files for …"; key hints ↑ ↓ / ↵ / esc in a pill under the palette from `sm`); and Arc `UserMenu` avatar on the right (Settings, Light / Dark / System, sign out). Settings is in the user menu (opens Profile); the workspace menu links the workspace pages |
| Route states | `EmptyState` (error, not found), `Skeleton` (loading) |
| Auth pages, accept invitation (`app/(auth)/layout.tsx`, `AuthShell`) | Split layout: Sahihi mark top left, the form centred (`AuthForm` in `components/app/auth/`: `h1` + one line such as "New to Sahihi? Create an account", no card), footer with © and "Verify a signed document"; from `lg` the `BrandPanel` on the right (`bg-muted`, tagline from `lib/brand.ts`, two sample cards with Arc `Badge` and `Progress`, decorative). Sign in: passkey `Button` first, `AuthDivider` "or with email", then `Input`, `PasswordField`, `Button`, `Alert` |
| Onboarding (`app/(onboarding)/onboarding`, ADR 0061) | `AuthShell` with a step preview on the right (`components/app/onboarding/onboarding-asides.tsx`: what recipients see, who can do what, how the assistant works; the brand panel until a name is typed). A three-part step bar, then `AuthForm`: Workspace (`Input`, logo picker with an `on-paper` preview, "Create workspace"), Team (`InviteRows`: `Input` + Arc `Select` role per row, "Add another" up to the seats left, seat line, "Send invitations" / "Skip for now"), AI assistant (Arc `RadioGroup` Turn it on / Not now, "Finish setup") |
| Signed documents (`app/(personal)/signed`, ADR 0062) | Own frame: Sahihi mark, "Personal", "Create a workspace" (or "Go to your workspace") `ButtonLink`, `UserMenu` without Settings. `h1` + count; "Waiting for you" rows with "Email me the signing link" (or "You'll get an email when it's your turn"), then "Signed by you" rows (title, workspace, when you signed, status `Badge`, Download or Verify); `EmptyState`; an info `Alert` until the email is confirmed |
| All files (`/files`, home, ADR 0038) | The first nav item and where sign-in, onboarding and a workspace switch land. The Get started checklist at the top level (`GettingStarted`, ADR 0061: a card with "2 of 5 done", `Progress` and Hide, then one row per step with a check and the step's action, hidden once done or dismissed). Envelope quota `Alert` under the header when close to or at the limit (moved here from the old Envelopes list, ADR 0041). The old Documents, Envelopes and Templates lists redirect here with `?type=`. Header (`FolderBreadcrumb` inside a folder, `FolderHeading` with the folder's colour dot and tags, the count "3 items, 2 folders" beside the title) with Create folder (secondary icon `Button` + `Tooltip`), Upload document (secondary) and New envelope (primary, in the open folder). `FilesToolbar` on `ListSearch` (from `md` one row: a 20rem filled search, the chips, List / Grid): "Search documents, envelopes, templates and folders", chips Type / Status / People / Added / Tags / Color, List / Grid (`sahihi-files-layout` cookie). Status lists envelope stages, a separator, then document states (`ChipOption.separatorBefore`); picking one sets Type too. Folders: `FolderCards` (grid) or `FolderRows` (list, first page) from `components/app/folders/folder-section.tsx`; only while not filtering, or for a search, tag or colour. Grid: each item's own card (`DocumentCard`, `EnvelopeCard`, `TemplateCard` on `ListCard`: page thumbnail on top, then the title row, then the footer). List: `Panel` + coss `Table`, one line per row, never a second line in a cell (Name with the type mark, colour dot and tags; from `md` Type and Status (`TypeCell`, `StatusCell`: an Arc `Badge`, "2 of 3 signed" in info blue while an envelope is out, else its status; documents only when not ready); Recipients from `lg`, truncated with the full text on hover (`DetailsCell`: recipients, the source document, a template's documents, a folder's contents); Added; the type's own ⋮ menu). Empty: the upload drop zone; no matches: `EmptyState` |
| Upload | Extend `FileUpload` in an Arc `Dialog`, `Progress` |
| Drafting (`/generate`, docs/ai-documents.md; its own tab in the top bar) | Header `h1` (no subtitle), with "Import a document" (secondary Arc `Button`, opens the import `Dialog`) and "Blank document" (primary Arc `Button`) on the right, as on All files; "Start from a starter" first (tonal tiles, five across from `xl`), then "Your drafts" (only once there are some): the All files list-view table in a `Panel` (coss `Table`; Name with a sparkles mark and title link, one line; Status `Badge` Draft / Finalised; Versions from `lg`; Owner `Person`; Edited date; no selection; ⋮ Arc `DropdownMenu` Open / Open envelope / Delete (drafts, for whoever may edit) with a `ConfirmDialog`; below `md` the name only), then "Workspace templates"; starters and templates as unboxed grids of tonal tiles in the file cards' style (`bg-muted`, no border, type icon, name, description, chevron; the whole tile starts the document, one start at a time, delete template above it). Off or not configured: `EmptyState` (owners and admins get "Turn on for this workspace"). The Drafting tab is the way in (All files no longer has a "Draft with AI" button) |
| AI document generator (`/generate/:id`, ADR 0042) | Full page (`isFullPage`), own bar: back (coss icon `Button` + `Tooltip`), title, `Badge` (draft and version, or Finalised), Finalise (`Button`, `Tooltip` saying what's left) or Open envelope (`ButtonLink`). Assistant left, document right (CSS grid; below `md` a `SegmentedControl` picks the pane, both stay mounted). Chat: assistant-ui headless primitives (`ThreadPrimitive`, `MessagePrimitive`, `ComposerPrimitive`); empty state is a dashed card with an Arc `Button` "Start drafting"; question card (`border-info`, mono "Question n of m", coss outline `Button`s as full-width option rows with a chevron (Arc's button can't left-align), a muted footer with Arc `Input`, ghost Skip and Answer, dismiss icon button), answered questions as rounded cards, proposal cards (title, `Badge` status, reason, word diff with `del` / `ins` in `text-destructive-foreground` / `bg-success/10`, Reject ghost and Accept `Button`s); a pending suggestion adds an info `Badge` "Suggested edit" to its section in the editor. Composer closed while a question card waits. Composer: one rounded card (selected-section header in `bg-info/10` with an excerpt and a clear icon `Button`, borderless `ComposerPrimitive.Input`, round coss icon `Button` for send / stop); a sent message with a section shows a `border-info` quote above it. Document pane on `bg-muted/30`: `SegmentedControl` (Preview / Editing / Signers / PDF) and an Arc `Badge` (warning "N blanks open", success "All blanks filled"). Preview: the TipTap editor read-only, sections as `role="button"` rows with a hover pill "Ask about this" and `bg-info/10 ring-info` when selected; Editing: TipTap editor (ADR 0043) with a sticky coss `Toolbar` (`Toggle` for bold / italic / underline / lists, icon `Button`s for table, insert blank (`Popover` with the blanks and an `Input` for a new one), add section, undo and redo, Arc `Tooltip`s), an `Alert` for a text conflict, sections with an inline title field, blanks as dashed `border-warning` chips (filled: dotted `decoration-info` underline) with a `Popover` + `Input` to fill one, signature blocks as dashed cards; Signers: `Panel` per role (description "Signs for <party>") with `Input`s (role, name, email), a ghost `Button` `Use "<party>"` while the name is empty, `Select` (signer / gets a copy), `Switch` (initials on every page), a field list (rows with `Input` for text and checkbox labels, `Checkbox` required, remove icon `Button`) and `DropdownMenu` "Add field"; an info `Alert` with "Add signer for …" `Button`s for parties nobody signs for; "Add signer" and "Save signers" `Button`s; a suggested set of signers diffs line by line); PDF: `DocumentViewer`). Finalise: `ConfirmDialog` + `Checkbox` |
| New envelope | `Panel`, `Combobox` (document), `Input`, `Textarea`, `Switch` (sign in order), `DatePicker` (expiry) |
| Prepare document | Extend `PDFEditor` (full, see configurations below) with a side panel like the field tools (`ScrollArea`, `Separator`, Arc `Button`; Arc `Drawer` below `lg`), `Dialog` + `Progress` (save as new document) |
| Draft envelope editor (`/envelopes/:id/edit`, ADR 0021, ADR 0031) | Full page: the app shell hides its bar (`isFullPage` in `lib/nav.ts`). Own top bar (`EditorHeader`): back (coss icon `Button` + Arc `Tooltip`), title, status `Badge`; the steps as the shared `PillNav` with an Arc `Tooltip` each; Arc `SplitButton` (main: Save as template `Dialog`; menu: Download original, Open document, Activity `Drawer`) and Send; below `sm` the buttons get their own row. Steps: prepare document (Extend `PDFEditor` configuration #2, "Skip" / "Save and use", ADR 0024) → `Panel` + recipients editor (`Input`, `Select` role / verification, `NumberField` step) → field editor → preview with a read-only field overlay (the field editor's view-only `PDFEditor`, document switcher in its ribbon row); `Alert` (preflight), "Review & send" `Dialog` (`Input`, `Textarea`, `Switch`, `DatePicker`) **Multi-document (ADR 0037):** step 1 is "Documents": an ordered list (PDF mark, name, pages, field count, ⋮ Prepare pages… / Open in library / Move up / Move down / Remove), "Add document" (Arc `Dialog`: `SearchField` over READY library documents + Extend `FileUpload` upload), and "Supporting files" (`AttachmentsList`: Extend `FileUpload` with the allowlist, rows with type icon, size and ⋮ Download / Remove, Arc `Progress` while uploading). "Prepare pages…" opens the full PDF editor for that document with "All documents" to go back. Fields and Preview show one document at a time behind `DocumentSwitcher` (Arc `SegmentedControl`, numbered names, field count per document). |
| Field editor | Extend `PDFEditor` (view-only shell + `renderPageOverlay` field layer inside `.on-paper`, field tools in a side panel, ADR 0019/0021); coss `Toggle` (field types), coss `Select` (recipient, with colour dots), coss `Kbd`, `ScrollArea`; Arc `Drawer` (palette below `lg`), `Input` (label), `Checkbox` (required), `Tooltip` + `Button` (**Detect fields**, ADR 0020: anchor tags and form fields, or labelled signature lines; numbered roles to that recipient, named roles split in list order, the rest to the active recipient; already placed fields are skipped) One state for every document (`EditorField.envelopeDocumentId`); the field layer draws only the active document's fields; "Detect fields" runs on the active document; the editor remounts when the set of documents changes (ADR 0037). Placing a field goes back to Select (hold Shift to place several). Field labels are centred and sized from the field's height (10–16 px). Fields and Preview open at `automatic` zoom (fit width, at most 100 %) and show a page-shaped `Skeleton` (`PdfFrame`) until the first page image has drawn. |
| Envelope detail (read-only; editable drafts redirect to the draft editor) | Header (title, status `Badge`, signing order and expiry; Save as template, `CopyButton` status, Void), a signing-progress strip while out for signature (`Progress` "n of m signed" + who it's waiting for), `Tabs` (Document / Recipients / Activity) whose panels don't repeat the tab name, coss `Table`, `Timeline` (activity, one glyph per event type), `ConfirmDialog` + `Textarea` (void), `DropdownMenu` per recipient The first tab is "Documents": `DocumentSwitcher` + Extend viewer per document, then the supporting files (download only). Downloads: `DownloadButtons` = Arc `SplitButton` "Download all" with each signed document, the certificate and each file in its menu (two plain buttons when there is one document and no files) (ADR 0037). |
| Public signing | Extend `PDFViewer` (lighter; **not** `PDFEditor`) with fields inside `.on-paper` (coss `Checkbox` for checkbox fields, Arc `Popover` + `Input` for text fields), signature dialog (`Dialog`, `Tabs`, `SignaturePad` for Draw, ADR 0008), `OtpInput`, `Checkbox` (consent), `Progress`, `Alert`, `ConfirmDialog` (decline) Several documents: `DocumentSwitcher` above the viewer with required fields left per document (✓ when done); "Next field" crosses documents; the header panel lists "Supporting files (to read, not to sign)" with download (ADR 0037). |
| Verify (`app/verify/`, own layout with the Sahihi mark) | `/verify`: centred `h1` and lede, the checker in a card (Extend `FileUpload`, hashed locally; `Input` for a code; coss `Spinner`), then "How verification works" in three steps. `/verify/:code`: a success strip ("Certificate verified", issue time, mono code + Arc `CopyButton`), then a card with the title, a facts row (sent by, completed, signers, documents), signers as rows (`Avatar`, masked email, signed time), every signed document with its signed and original SHA-256 (`HashRow`: mono, truncated, copy), then the supporting files' hashes (ADR 0037); `Alert` when no certificate matches |
| Signing (`/sign/:token`, `SigningSurface`) | Header row: org logo (on paper), title, "From sender · workspace"; progress ("0 of 1 required done" + `Progress`) and "Go to next field" (primary until all required are done, sticky on phones). Below, from `lg` a grid: the PDF (`PDFViewer`, fields in `.on-paper`) on the left; on the right a card with the sender (`Avatar`), their message, "Your fields" (each field this signer fills, in reading order: label, required or optional, page; a check once filled; click to go to it) and supporting files, then a sticky Finish card (`Checkbox` consent, primary "Finish signing", ghost "Decline to sign" → `ConfirmDialog` + `Textarea`). Phones: message, document, finish. Changed consent wording: `ConfirmDialog` "The signing terms were updated" with Reload. Signed / completed states: `AccountInvite` (optional account: three points, "Create a free account", "Continue without an account"; a link to `/signed` when signed in; never when embedded) |
| Settings shell | From `lg`: sticky side nav (`SettingsNav`, ADR 0055) grouped Account / Workspace, current page on `bg-muted`; below `lg`: `Tabs` (navigates between settings pages) |
| Settings / profile | `SettingsSection`, `Avatar` (xl) + hidden file input (picture), `Input` (name), `Badge` + `Dialog` (change email), `SignatureCaptureDialog` (save signature, `on-paper` previews), `ConfirmDialog` (remove) |
| Settings / security | `PasswordField` + `Checkbox` (password), `Badge` + `Dialog` steps with `PasswordField`, QR (`qrcode` data URL on `on-paper`), `OtpInput`, `CopyButton` (2FA, backup codes), coss `Table` + `Badge` (sessions), `ConfirmDialog` |
| Settings / workspace | `Input` (name), logo preview on `on-paper` + hidden file input, AI assistant `Switch` (`AssistantSwitch`, owners and admins, only when the server has a model), `ConfirmDialog` (remove logo, leave) |
| Sign in / two-factor | `AuthForm`, `OtpInput` or `Input` (backup code), `Checkbox` (trust device) |
| Settings / members | Seat line under the heading ("2 of 2 seats used on the Free plan" + Plan & usage link), `Tabs`, coss `Table`, `Avatar`, coss `Select` (role, in the table), `Dialog` + `RadioGroup` (invite), `ConfirmDialog` (remove) |
| Settings / plan & usage | `UsageMeter` (envelopes, seats; `MetricCard` when unlimited), coss `Table` (plans), `Badge` |
| Settings / data | `SettingsSection` (retention `Select`, exports coss `Table` + `Badge`, danger zone), `ConfirmDialog` + `Input` (typed confirmation) |
| Settings / storage (docs/storage.md) | Sections "Sync" and "Primary storage" (heading + line + actions, like Webhooks), one card per connection (`Badge` status ("Test failed" when the first test failed) and primary state, mono location line, a details line (provider, region, how it signs in), Arc `DropdownMenu`: test, edit, copy earlier envelopes, retry failed, disconnect; `Alert` with the last error; coss `Table` + `Badge` deliveries with Retry; `Progress` while files move), `Dialog` + `Select` (provider presets) + `Input`s + `PasswordField` + `RadioGroup` (key or IAM role, with copyable policy JSON) to connect a bucket, `Dialog` for Google Drive / OneDrive before their sign-in, `ConfirmDialog` (start using, disconnect), `EmptyState` in a `Panel` for "nothing yet" and, with the same shape and "See plans", for a tier the plan lacks; "Released files" as a third section (heading, line, CSV `ButtonLink`, coss `Table` in a `Panel` showing the end of each key). Section adds are secondary `Button`s with a plus, verb "Connect", like "Add webhook"; monospace via `font-mono` |
| Settings / API (and webhooks) | coss `Table` + `Badge` (keys, deliveries), `Dialog` + `Checkbox` list + `RadioGroup` (create key), `Dialog` + `Checkbox` list (webhook events), `Switch` (endpoint active), `DropdownMenu` (test, edit, rotate, delete), `ConfirmDialog` (revoke, rotate, delete), `Alert` + `CopyButton` (secret shown once), `Textarea` (embed origins) |
| Bulk send | Page header ("Bulk send", from which template), then one `Panel` per step (Prepare a CSV, Upload it with Extend `FileUpload` parsed in the browser and `Alert` problems / ready, Check and send with `Input`, `Textarea`, coss `Table` preview); the send button says why it's disabled. Batch page: "Bulk send: <template>", `Progress` + coss `Table` + `Badge` per row |
| Inbox (`/inbox`, ADR 0041) | Header `h1` + ghost `ButtonLink` "Notification settings"; Arc `Tabs` through `?tab=` (Notifications with the unread count / Workspace activity / Bulk sends). Every tab starts with `ListSearch` (filled search + chips + Clear filters, no List / Grid). Notifications: chips Status (Unread / Read) / Type / Date, with a ghost `Button` Mark all read at the end of the row (`ListSearch` `actions`); a `Panel` with the list in day groups (`lib/group-by-day.ts`: Today, Yesterday, "13 Oct 2026", Nairobi days; muted header row per day), each row: info dot while unread, the type's mark (`NotificationIcon`, coloured only for outcomes), title, body, the time (14:05); secondary `Button` "Open …" on wide rows + ⋮ Arc `DropdownMenu`: Open, Mark read/unread, Dismiss; "Load more"; under the panel "2 unread" / "All read" (badge count, hidden while filtering) and a ghost `Button` Clear read notifications; `EmptyState` (nothing yet, or no matches + Clear search and filters). Workspace activity: chips Type (Signing / Sending / System) / People / Date; Arc `Timeline` in a `Panel` (icons and tones shared with the envelope Activity tab, `auditTimelineStyle`; meta = envelope title · by actor; expands to a link), "Load more". Bulk sends: chip Status (In progress / Finished / With failures); Arc `SortableDataTable` (`BulkSendsTable`), or `EmptyState` + Go to templates |

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
`onToast={(t) => toastManager.add({ title: t.message, type: t.tone })}` (`toastManager` from `@/components/app/toast`).

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
  ribbonContent={<FieldToolbar … />}   // ADR 0019 patch: field tools in the editor's own row
  onToast={…}
/>
```

- The draft editor's Preview step reuses this configuration with a read-only overlay and
  `showDownload` on, so its document switcher sits in the same ribbon row as on the Fields step.
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
`PrepareDocument` is used on `/documents/:id/prepare` (opens the new document) and as the draft
editor's first step (`onSaved` switches the envelope to it, ADR 0024).
Never call `download` or trust these bytes as a signed result.

**Never** use `PDFEditor`'s `sign` mode or `getDocumentBuffer()` output for signing. Signers submit
values only, and the server stamps the PDF (ADR 0004).

## Motion

Arc owns motion: curves and durations in `components/arc/foundation.css` (`--ease-enter`,
`--duration-fast` 160ms, `--duration-standard` 240ms…) and `components/arc/lib/motion-tokens.ts`
(springs, stagger, blur) for Motion code. Its primitives already press (Button `whileTap`, scaled by
width), scale popovers from their trigger, and honour `prefers-reduced-motion`. App code adds motion
only on surfaces Arc doesn't draw, and only with these tokens: no new curves, no `transition-all`, no
`ease-in`, nothing over 300ms, never `scale(0)`.

Decide in this order:

1. **How often is it seen?** Keyboard actions, tables and lists people open many times a day
   (documents, envelopes, templates), sorting, paging, filtering, the theme switch and the autosave
   label stay instant. Occasional moments (a dialog, a signing outcome, a verify result) get a short
   entrance. Only rare, one-off moments may add delight.
2. **What does it explain?** Feedback on press, a state that changed, or something new appearing.
   "It looks nice" is not a reason on a surface people see often.
3. **Direct manipulation is instant.** Dragging and resizing fields follow the pointer with no
   transition; only a field's first appearance animates.

Classes in `app/app.css` (they carry their own reduced-motion rule: movement off, opacity kept):

| Class | Use |
|---|---|
| `press` | Custom clickable surfaces that aren't Arc buttons: signing fields, field palette toggles. Shrinks to `.97` while held |
| `press-subtle` | Large clickable cards (folder cards; `:has(a:active)` covers a stretched link). `.985` |
| `enter-fade` | Content that replaces a loading or previous state (signing outcome). Pair with `style={stagger(i)}` from `components/app/motion.ts` on list items for a 35ms cascade, capped at 8 steps |
| `enter-pop` | An object the user just placed (a field on the page): from `scale(.95)` and transparent |

For a label that changes a few letters at a time (Publish → Published), use Arc `TextMorph`. For a
gliding active indicator, Motion `layoutId` with `motionTokens.spring.snappy` and
`useReducedMotion()` (see `PillNav`).

Vendored coss items with `transition-all` (dialog, sheet, command overlays; accordion, progress,
meter, sidebar rail) are either unused by app code or only fade opacity, so they stay unpatched.

## Popovers inside dialogs

Arc's `DialogContent` scrolls (`overflow: auto`), and Arc's `DatePicker`, `ColorPicker` and
`Combobox` open their popover inline (absolutely positioned, not portaled), so the dialog's edge cuts
it off. A dialog that holds one passes `className={DIALOG_WITH_POPOVERS}` (on windows ≥ `sm` and
46rem tall: overflow visible, dialog near the top) and wraps its fields in `<RevealPopovers>` (an
opening popover is scrolled into view on short windows). Put such fields high in the form, since
the popovers open downwards. Radix-portaled Arc items (`Select`, `Popover`, `DropdownMenu`,
`Tooltip`) don't need this.

## Drag and drop (ADR 0039)

All files wraps its content in `FilesDnd` (`components/app/files/files-dnd.tsx`). Rows and cards
use `DragRow` / `DragCard`, the checkbox column `SelectCell` / `SelectHead`, crumbs
`BreadcrumbDrops` (`components/app/files/drag-items.tsx`). Outside `FilesDnd` they render as plain
rows and cards, so shared folder components work on every page.

- Mouse drags start after 6 px, touch drags after a 250 ms press; a drag on a selected item takes
  the selection. The overlay chip is `bg-popover` with `--shadow-floating`; a dragged item fades to 50 %.
- Dropping onto a file (not a folder) puts both in a new "New folder" next to it (`POST
  /files/group`); the file highlights like a folder does.
- A valid drop target shows `ring-2 ring-ring` (plus `bg-accent` on rows). Invalid targets (a
  folder into itself, everything already there) don't highlight and do nothing.
- The keyboard path is the checkbox and the floating selection bar (`SelectionBar`: count, Select
  all, Move…, Clear). Esc clears. While it shows, the page gets room at the end so it never covers
  the last row or the pagination.
- Desktop files: a dashed `border-primary` frame round the window and a `bg-primary` pill naming
  the target folder. Desktop drops are ignored while a dialog is open.
- Moves end in a success toast with **Undo**; refusals in an error toast with the API's message.
- Motion (Arc tokens): the chip lifts in from 95 % (`--duration-instant`, `--ease-enter`; a second
  card behind it for several items). On a valid drop it fades in place (120 ms) and the moved items
  hide at once (not while searching), coming back if the API refuses; any other drop glides back
  to the item (200 ms), so "nothing moved" is visible. Drag fades and drop highlights ease over
  `--duration-instant`. The selection bar slides up 8 px on `--ease-enter` and leaves faster. With
  reduced motion: no drop animation, opacity only.

## Label colours

Folder and document label colours (ADR 0025) are user-picked hex values (Arc `ColorPicker`, the nine
`LABEL_COLOR_PRESETS` as starting swatches). They are data, not theme: render them only through
`ColorDot` (`components/app/labels/labels.tsx`, inline `background` plus a hairline `ring-border`)
with `ColorName` for screen readers, never as text, fills or status.

## Recipient colours

`RECIPIENT_COLORS[recipient.colorIndex % 5]` in `lib/constants.ts` uses theme tokens only. Use it for
field outlines in the editor and for recipient chips.
