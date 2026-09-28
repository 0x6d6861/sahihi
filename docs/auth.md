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

The better-auth defaults are `owner`, `admin` and `member`. Planned permissions:

| Action | owner | admin | member |
|---|---|---|---|
| Upload documents, create & send envelopes | ✓ | ✓ | ✓ |
| Void any envelope in the org | ✓ | ✓ | own only |
| Invite / remove members | ✓ | ✓ | – |
| Billing, delete org | ✓ | – | – |

Enforcement isn't implemented yet (roadmap P5). When adding it, use the organization plugin's
access-control API rather than ad-hoc role string checks.

## Web flows

- `/sign-up` → verification email → `/onboarding` (create org, set active) → `/documents`
- `/sign-in?next=…` → back to `next`
- `/accept-invitation/[id]` → `organization.acceptInvitation`
- Workspace switcher (sidebar header, `components/app/app-shell/org-switcher.tsx`): lists
  `GET /api/auth/organization/list` (only the user's memberships). Choosing one calls
  `organization.setActive`, then goes to `/documents`, because the current page may belong to the
  previous org. "New workspace" → `/onboarding`.
- `proxy.ts` redirects signed-out users away from app routes. It only checks for the cookie; the
  API is the real guard.
