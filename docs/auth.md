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
- `basePath: "/api/auth"`, `cookiePrefix: "sahihi"`, `trustedOrigins: [WEB_URL]`
- Prisma adapter. Tables are in section 1 of `schema.prisma`

Client: `apps/web/lib/auth-client.ts` (`createAuthClient` + `organizationClient()`), exporting `signIn`,
`signUp`, `signOut`, `useSession`, `organization` and `useActiveOrganization`.

### Changing plugins

1. Edit `auth.ts` (and add the matching client plugin in `auth-client.ts`).
2. `bun run auth:schema` writes `packages/db/prisma/better-auth.generated.prisma` (gitignored).
3. Diff that file against section 1 of `schema.prisma`, merge by hand, keeping our back-relations
   (`documents`, `envelopes`).
4. `bun run db:migrate`.

Likely next plugins: `twoFactor` (senders), `magicLink`, and `admin` for internal staff.

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
| Invite / remove members, change roles | ✓ | ✓ | – |
| Billing (`billing:manage`, not built yet), delete org | ✓ | – | – |

"Own" means `Envelope.createdById` / `Document.uploadedById` is the caller. Owners and admins get
"any" from the `envelope:manage-any` and `document:delete-any` permissions.

**One definition:** `packages/core/src/permissions.ts` builds the access control with better-auth's
`createAccessControl`: the default org statements plus `document`, `envelope` and `billing`. It
exports `orgAc` and `orgRoles`, which are passed to `organization()` in `auth.ts` and to
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
`GET /documents/:id` returns `permissions: { delete }`, so the web can hide what the viewer can't do.
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

- **Members:** role `Select` and Remove (`AlertDialog`) → `organization.updateMemberRole` /
  `organization.removeMember`.
- **Invitations:** pending and expired invitations, with Resend (`inviteMember({ resend: true })`, which
  resets the 48 h expiry) and Cancel (`cancelInvitation`).
- **Invite member** dialog: `InviteMemberSchema` (email trimmed and lowercased, role) →
  `organization.inviteMember`. better-auth enqueues `auth.org-invitation`, which links to
  `/accept-invitation/<id>`. Server errors ("already a member", "already invited") show on the email
  field.

better-auth owns these endpoints and enforces them. The page only offers what it will accept, using
pure helpers in `packages/core/src/members.ts`:

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
