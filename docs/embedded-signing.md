# Embedded signing

Recipients sign **inside the customer's own site**, in an iframe, instead of following an email
link (ADR 0017). Code: `packages/core/src/embed.ts`, `packages/envelopes/src/embedded.ts`,
`apps/api/src/routes/{embedding,signing}.ts`, `apps/web/proxy.ts`, `apps/web/lib/embed.ts`.

## Setup

Owners and admins list the **allowed origins** under **Settings → API → Embedded signing**
(`GET/PUT /api/embedding`, `api:manage`). At most 10. Each must be `https://host[:port]` with no
path; `http://localhost` is allowed for development. They're normalised to the bare origin and
de-duplicated, then stored on `WorkspaceSettings.embedOrigins`.

## Flow

1. Create the envelope through the API with the recipient's `delivery: "EMBEDDED"` (the web
   recipients editor always uses email).
   Embedded recipients must use **link** verification: the host app has already authenticated them.
2. On send (or when their turn comes in a sequential envelope) an embedded recipient is marked
   `SENT` with a `recipient.notified` audit event (`{ delivery: "embedded" }`). **No email, no
   link, no reminders** (the remind route returns 409).
3. When the user is on your page, your **server** asks for a URL:

   ```http
   POST /api/v1/envelopes/:id/recipients/:recipientId/signing-url
   → 201 { "url": "https://app.sahihi…/sign/<token>?embed=1", "expiresAt": "…" }
   ```

   Every call issues a **new** token and invalidates the previous one, so request it right before
   showing it. Lifetime: 30 minutes (`EMBED_LINK_TTL_MS`), capped at the envelope's expiry. Each
   call writes `recipient.link_issued`.
   409 when the recipient isn't embedded (`not_embedded`), the envelope isn't out for signature
   (`envelope_not_active`), it isn't their turn (`not_their_turn`) or they already signed or
   declined (`already_done`).
4. Put the URL in an iframe. The page posts messages to the parent:

   ```js
   window.addEventListener("message", (e) => {
     if (e.origin !== "https://app.sahihi.co.ke") return
     // e.data = { type: "sahihi:ready" | "sahihi:signed" | "sahihi:declined", state }
   })
   ```

   Treat these as UI hints only. Confirm the outcome with a webhook (`recipient.signed`) or
   `GET /api/v1/envelopes/:id`.

## Framing (security)

Signing pages normally send `frame-ancestors 'none'` (docs/security.md). For
`/sign/<token>?embed=1` only, `proxy.ts` asks the API `GET /api/sign/<token>/embed` (rate-limited,
2 s timeout) and sets `frame-ancestors` to the returned origins. The API returns the workspace's
origins **only** for a valid token of an `EMBEDDED` recipient, and `[]` otherwise; any failure
falls back to `'none'`. So:

- email recipients' pages can never be framed, even with `?embed=1`;
- other sites can't frame the page (the browser enforces `frame-ancestors`);
- `postMessage` targets each allowed origin explicitly, never `*`, so events reach only a real
  allowed parent.

The rest of the signing experience (consent, fields, audit, completion) is unchanged.

## Not in v1

- A JS SDK / web component wrapper; theming the embedded page.
- Embedded **sending** (field placement inside the host app).
