# Authentication & tenancy

There are two kinds of people, and they authenticate completely differently.

| | Senders | Signers (recipients) |
|---|---|---|
| Who | SaaS customers, members of an Organization | Anyone an envelope is sent to |
| Identity | better-auth user (email + password, verified email) | Possession of a signing link, optionally plus an OTP |
| Session | better-auth cookie `sahihi.session_token` | None. The token in the URL, plus a signed `sahihi_signer` cookie after OTP |
| Routes | `/api/documents/*`, `/api/envelopes/*` behind `requireOrg` | `/api/sign/:token/*` |

Signers **never** get accounts. Don't add better-auth checks to signing routes, and don't let signing
tokens unlock anything outside their own envelope.

## better-auth setup

`apps/api/src/auth.ts`:

- `emailAndPassword` with `requireEmailVerification: true`, minimum 10 characters
- Verification, reset and invitation emails are **enqueued** (`notifications` queue), never sent inline
- `organization()` plugin with `allowUserToCreateOrganization: true`
- `twoFactor()` plugin (TOTP + backup codes, issuer "Sahihi")
- `user.changeEmail` with `sendChangeEmailConfirmation` (job `auth.change-email` to the current address)
- `basePath: "/api/auth"`, `cookiePrefix: "sahihi"`, `trustedOrigins: [WEB_URL]`
- Prisma adapter. Tables are in section 1 of `schema.prisma`

Client: `apps/web/lib/auth-client.ts` (`createAuthClient` + `organizationClient()` + `twoFactorClient()`),
exporting `signIn`, `signUp`, `signOut`, `useSession`, `organization`, `useActiveOrganization`,
`twoFactor`, `updateUser`, `changeEmail`, `changePassword`, `revokeSession` and `revokeOtherSessions`.

### Changing plugins

1. Edit `auth.ts` (and add the matching client plugin in `auth-client.ts`).
2. `bun run auth:schema` writes `packages/db/prisma/better-auth.generated.prisma` (gitignored).
3. Diff that file against section 1 of `schema.prisma`, merge by hand, keeping our back-relations
   (`documents`, `envelopes`).
4. `bun run db:migrate`.

`bun run auth:schema` needs network access (it fetches the better-auth CLI). Offline, copy the
plugin's `schema.mjs` into section 1 by hand, as was done for `twoFactor` (model `TwoFactor`,
`User.twoFactorEnabled`).

Likely next plugins: see **What better-auth offers next** below.

## Account settings

Settings has three account tabs before the workspace ones (`SETTINGS_NAV` in `lib/nav.ts`):
**Profile**, **Security**, **Workspace**, then Members, Plan & usage, Data and API. The user menu
opens Profile.

### Profile (`/settings/profile`, any signed-in user)

| What | How |
|---|---|
| Picture | `PUT/DELETE /api/me/avatar`. The browser crops the centre square to 256×256 PNG; the API checks it (`avatarProblem`), stores `user/{userId}/avatar-{version}.png` (row `UserAvatar`) and sets `User.image` to `/api/avatars/{userId}?v={version}` (`avatarUrl`). The account menu and members table read `User.image`. A photo is personal data, so `GET /api/avatars/:userId` (`routes/avatars.ts`) needs a session and serves only the user and people sharing a workspace with them (others get 404), `Cache-Control: private`. A `databaseHooks.user.update.before` hook refuses `image` through better-auth's `update-user` |
| Name | better-auth `update-user` (`UpdateProfileSchema`) |
| Email | better-auth `change-email`. A verified user gets a confirmation link at the **current** address (`auth.change-email` job); following it sends the usual verification link to the new address, and the email changes once that's followed |
| Saved signature and initials | `GET/PUT /api/me/signatures`, `DELETE /api/me/signatures/:kind` (`apps/api/src/routes/me.ts`, `requireUser`: session, no active org needed). PNGs (`SaveSignatureSchema`, same cap as signing) at `user/{userId}/{kind}-{version}.png`; row `SavedSignature` |

The saved signature is offered on signing pages: `SigningSurface` calls `GET /api/me/signatures`
(it returns the user's email too) and, when `offersSavedSignature(user.email, recipient.email)`
holds, pre-fills the capture dialog's "Use this signature". The signing routes don't change and
never look at the session (signers still don't need accounts); the PNG is submitted like a freshly
drawn one. Signed-out signers and embedded iframes (no cookie) get a 401 and see nothing new.

### Security (`/settings/security`)

| What | How |
|---|---|
| Change password | better-auth `change-password` (`ChangePasswordSchema`), "Sign out of other devices" on by default |
| Two-factor authentication | `twoFactor` plugin. Turn on: password → `enable` (returns the `otpauth://` URI, shown as a QR code with `qrcode`, plus 10 backup codes) → `verify-totp` with a code from the app → backup codes shown once (copy / download). Also: new backup codes, turn off (both need the password) |
| Sessions | better-auth `list-sessions`, `revoke-session`, `revoke-other-sessions`. Device names come from `describeUserAgent` |

Sign-in with 2FA: `signIn.email` answers `{ twoFactorRedirect: true }` and sets a 10-minute
two-factor cookie instead of a session. The sign-in form sends the user to
`/sign-in/two-factor?next=…`, which calls `verify-totp` or `verify-backup-code` (optionally
"trust this device" for 30 days). better-auth locks the account for 15 minutes after 10 failed codes.

### Workspace (`/settings/workspace`)

| What | Who | How |
|---|---|---|
| Rename | owner, admin (`canEditWorkspace` = `organization:update`) | better-auth `organization.update` |
| Logo | owner, admin | `PUT/DELETE /api/workspace/logo` (`routes/workspace.ts`) |
| Leave | everyone except the last owner (`canLeaveWorkspace`) | better-auth `organization.leave`, then the next workspace becomes active (or `/onboarding`) |

Deleting the workspace stays under Data.

**Logos.** The browser resizes the image into 640×160 and re-encodes it as PNG; the API checks the
PNG signature and size (`logoProblem`), stores it at `org/{orgId}/branding/logo-{version}.png`
(`WorkspaceSettings.logoKey`) and sets `Organization.logo` to
`{WEB_URL}/api/branding/{orgId}/logo.png?v={version}` (`workspaceLogoUrl`). That public route
(`routes/branding.ts`, rate-limited) streams the stored PNG with long caching and
`Cross-Origin-Resource-Policy: cross-origin` so webmail can show it. It reads the key from the
database, never from the request.

Every consumer reads `Organization.logo`: signing emails (`brandFor(org, WEB_URL)`; https only,
plus the web origin itself so Mailpit shows it in development), the signing page header
(`brandingLogoPath` keeps only our branding path, served same-origin). better-auth's
`beforeCreateOrganization` / `beforeUpdateOrganization` hooks refuse a `logo`, so it can't be set
to an arbitrary remote image (a tracking pixel in every email).

### What better-auth offers next

Available in better-auth 1.7 and not enabled yet, roughly in order of value:

| Feature | What it takes |
|---|---|
| Passkeys | `@better-auth/passkey` package (new dependency) + a `passkey` table; sign-in button and a Security panel |
| Delete account | `user.deleteUser` with `sendDeleteAccountVerification` and a `beforeDelete` that refuses while the user is the last owner of a workspace (and handles their envelopes' `createdById`) |
| Email OTP as a second factor | `twoFactor({ otpOptions: { sendOTP } })` + a notifications job; fallback for users without an authenticator app |
| Forgot password page | `sendResetPassword` is already wired; needs `/forgot-password` and `/reset-password` pages |
| Social sign-in (Google, Microsoft) | `socialProviders` + env vars; Security would list linked accounts (`list-accounts`, `unlink-account`) |
| Breached-password check | `haveIBeenPwned()` plugin (calls an external API on sign-up and password change) |
| Last login method, multi-session | `lastLoginMethod()`, `multiSession()` plugins |
| SSO (SAML/OIDC) per workspace | `@better-auth/sso`, for enterprise plans |
| Admin (staff) | `admin()` plugin: impersonation, bans, for internal support |

## Cookies (why the API is proxied)

The browser calls `/api/*` on the **web origin**, and `next.config.ts` rewrites those calls to the Hono
API. Cookies are therefore first-party, `SameSite=Lax` works, and there's no cross-site cookie
configuration. Consequences:

- `BETTER_AUTH_URL` = the **web** origin (e.g. `http://localhost:3000`).
- Server Components call the API directly (`API_URL`) with `lib/api-server.ts`, which forwards the
  incoming `cookie` header.
- If you ever serve the API on its own public domain, you'll need `crossSubDomainCookies` or a shared
  parent domain. Write an ADR first.

## Tenancy

- A user can belong to many organizations. `session.activeOrganizationId` selects the current one.
- `requireOrg` middleware (`apps/api/src/middleware/session.ts`):
  1. valid session, or 401
  2. `activeOrganizationId` set, or 403 `no_active_organization` (the web app sends these users to
     `/onboarding`)
  3. the user is a `Member` of that org, or 403
  4. sets `c.var.user`, `session`, `organizationId` and `memberRole`
- Every tenant-owned row has `organizationId`, and queries use `forOrganization(orgId)`. See
  `security.md`.

### Roles

The better-auth defaults are `owner`, `admin` and `member`. The creator of an org is its owner.

| Action | owner | admin | member |
|---|---|---|---|
| View every document and envelope in the org | ✓ | ✓ | ✓ |
| Upload documents, create envelopes | ✓ | ✓ | ✓ |
| Edit, send, remind or void an envelope | any | any | own only |
| Delete a document | any | any | own only |
| Use templates / save envelopes as templates | ✓ | ✓ | ✓ |
| Rename or delete a template | any | any | own only |
| Create folders (Documents page) | ✓ | ✓ | ✓ |
| Rename, move or delete a folder | any | any | own only |
| Move a document between folders | any | any | own only |
| Webhooks (view, add, edit, rotate, delete) | ✓ | ✓ | – |
| API keys and embedded-signing origins (`api:manage`) | ✓ | ✓ | – |
| Bulk send from a template | ✓ | ✓ | ✓ |
| Data: retention, exports, "Delete data" on closed envelopes (`data:manage`) | ✓ | ✓ | – |
| Invite / remove members, change roles | ✓ | ✓ | – |
| Billing (`billing:manage`, reserved for self-serve plan changes), delete org | ✓ | – | – |
| See the plan and usage (Settings → Plan & usage) | ✓ | ✓ | ✓ |

"Own" means `Envelope.createdById` / `Document.uploadedById` / `Folder.createdById` is the caller.
Owners and admins get "any" from the `envelope:manage-any`, `document:delete-any` and
`folder:manage-any` permissions. Moving a document follows the delete rule (`canMoveDocument`).

**One definition:** `packages/core/src/workspace/permissions.ts` builds the access control with better-auth's
`createAccessControl`: the default org statements plus `document`, `envelope`, `template`,
`folder`, `webhook`, `data`, `api` and `billing`. It exports `orgAc` and `orgRoles`, which are passed to `organization()` in `auth.ts` and to
`organizationClient()` in `auth-client.ts`. better-auth enforces its own resources (members,
invitations, org delete) with them. Our routes use the pure helpers from the same file:

- `hasPermission(role, { envelope: ["manage-any"] })` reads `Member.role`, which may be
  comma-separated when a member has several roles. Unknown roles get nothing.
- `canManageEnvelope(actor, envelope)` / `canDeleteDocument(actor, document)` check the owner or the
  `*-any` permission.

**API** (`apps/api/src/lib/permissions.ts`): after the tenant-scoped lookup, the envelope routes
(`PUT recipients|fields`, `send`, `void`, `remind`) call `assertCanManageEnvelope`, and
`DELETE /documents/:id` calls `assertCanDeleteDocument`. A refusal is `403 { error: "forbidden" }`.
Another org's rows are still a 404. `GET /envelopes/:id` returns `permissions: { manage }` and
`GET /documents/:id` returns `permissions: { delete }` (list rows: `permissions: { move }`, folders:
`permissions: { manage }`), so the web can hide what the viewer can't do.
The API stays the guard.

**Web:** without `manage`, the envelope page renders read-only: document viewer, recipients table,
and no Send/Void/remind. It shows a "View only" notice while the envelope is still open.

To add an action: add it to `orgStatements`, grant it in `orgRoles`, check it with `hasPermission`
in the route, and add a case to `permissions.test.ts` and `apps/api/test/permissions.itest.ts`.
Static roles need no schema change. Dynamic (per-org custom) roles would need better-auth's
`dynamicAccessControl` and `bun run auth:schema`.

## Members & invitations

`/settings/members` (nav "Members", `app/(app)/settings/members/page.tsx`) loads
`GET /api/auth/organization/get-full-organization` for the active org. It has two tabs:

- **Members:** role `Select` and Remove (`ConfirmDialog`) → `organization.updateMemberRole` /
  `organization.removeMember`.
- **Invitations:** pending and expired invitations, with Resend (`inviteMember({ resend: true })`, which
  resets the 48 h expiry) and Cancel (`cancelInvitation`).
- **Invite member** dialog: `InviteMemberSchema` (email trimmed and lowercased, role) →
  `organization.inviteMember`. better-auth enqueues `auth.org-invitation`, which links to
  `/accept-invitation/<id>`. Server errors ("already a member", "already invited") show on the email
  field.

better-auth owns these endpoints and enforces them. The page only offers what it will accept, using
pure helpers in `packages/core/src/workspace/members.ts`:

| Rule | Helper |
|---|---|
| Invite: `invitation:create`; only owners invite owners | `invitableRoles(role)` |
| Cancel: `invitation:cancel` | `canCancelInvitations(role)` |
| Change role: `member:update`; only owners touch owners or assign owner; the last owner can't be demoted | `memberActions(viewer, target, ownerCount).assignableRoles` |
| Remove: `member:delete`; same owner rules; not yourself; never the last owner | `memberActions(…).canRemove` |
| better-auth keeps `status: "pending"` after expiry | `invitationState()` → `expired` |

`apps/api/test/members.itest.ts` runs every viewer × target × action against better-auth itself, so
an upgrade that changes its rules fails there instead of showing buttons that error.

Removing a member doesn't touch their documents or envelopes: they belong to the org, and signing
continues. After removal, only admins and owners can change those envelopes (the `manage-any` rule).

## Web flows

- `/sign-up` → verification email → `/onboarding` (create org, set active) → `/documents`
- `/sign-in?next=…` → back to `next`. New sessions start with the user's **first workspace active**
  (`databaseHooks.session.create.before` in `auth.ts`, by earliest `Member.createdAt`). Without it,
  every sign-in of an existing member landed on `/onboarding` and could create a duplicate
  workspace. Users with no membership still get `/onboarding`.
- `/accept-invitation/[id]` → `organization.acceptInvitation`
- Workspace switcher (sidebar header, `components/app/app-shell/org-switcher.tsx`): lists
  `GET /api/auth/organization/list` (only the user's memberships). Choosing one calls
  `organization.setActive`, then goes to `/documents`, because the current page may belong to the
  previous org. "New workspace" → `/onboarding`.
- `proxy.ts` redirects signed-out users away from app routes. It only checks for the cookie; the
  API is the real guard.
