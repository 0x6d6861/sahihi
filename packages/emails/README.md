# @sahihi/emails

Every transactional email Sahihi sends, built with [React Email](https://react.email). Used by the
worker (`apps/worker/src/jobs/notifications.ts`). Server-only: the web app must not import it.

```
src/
  index.ts             public API: one function per email → { subject, html, text }
  render.ts            renderEmail(): HTML + plain text from the same element
  brand.ts             org branding (brandFor, safeLogoUrl)
  components/layout.tsx   shared shell (header, CTA button, footer)
  templates/*.tsx      one file per email: component (default export), props type,
                       subject function, and PreviewProps sample data
```

| Template | Sent for |
|---|---|
| `signing-invite` | invite and reminder (org-branded, Reply-To sender) |
| `envelope-completed` | everyone signed (org-branded) |
| `envelope-declined` | a recipient declined (org-branded) |
| `envelope-voided` | the sender voided (org-branded) |
| `otp-code` | email verification code for signers (Sahihi-branded) |
| `auth-link` | verify email, reset password, org invitation (Sahihi-branded) |

## Preview

```bash
bun run emails:dev        # from the repo root → http://localhost:3030
```

This opens the React Email preview server, with every template rendered from its `PreviewProps`
and hot reload. Its Compatibility tab checks client support. To see an email exactly as sent,
trigger it in the app and open Mailpit (http://localhost:8025).

## Adding an email

1. Add `src/templates/<name>.tsx`, following the other templates:
   - export a props interface
   - export `<name>Subject(props)`
   - default-export the component, wrapped in `<Layout>`
   - set `Component.PreviewProps` to realistic sample data
2. Export a function for it in `src/index.ts` and add it to `TEMPLATES`.
3. Call it from the worker: `sendEmail({ to, tag, ...(await t.yourEmail(props)) })`.
4. `bun test packages/emails` renders every template with its `PreviewProps`, so a template that
   doesn't render fails CI.

Rules:
- User input (titles, messages, names, org names) goes in as JSX text, never
  `dangerouslySetInnerHTML`, so React escapes it.
- Use inline styles only; email clients ignore stylesheets and the app's theme tokens.
- Org logos pass through `safeLogoUrl` (https only).
