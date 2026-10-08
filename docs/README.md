# Docs index

| Doc | What's in it |
|---|---|
| [architecture.md](architecture.md) | System diagram, packages, domain model, API surface, queues, storage, deployment |
| [auth.md](auth.md) | better-auth for senders, token auth for signers, tenancy, roles, cookies |
| [signing-flow.md](signing-flow.md) | Draft → field placement → send → OTP → sign/decline → complete |
| [coordinates.md](coordinates.md) | Normalized field coordinates and conversion to PDF space |
| [pdf-pipeline.md](pdf-pipeline.md) | Upload/inspect, server-side stamping, finalize job |
| [certificates.md](certificates.md) | Certificate of Completion, verification, CA integration plan |
| [templates.md](templates.md) | Save an envelope as a template, use it |
| [webhooks.md](webhooks.md) | Signed event delivery to customer endpoints |
| [notifications.md](notifications.md) | In-app notifications: types, audiences, preferences, the bell |
| [public-api.md](public-api.md) | `/api/v1`, API keys, scopes, endpoints |
| [bulk-send.md](bulk-send.md) | One template → many envelopes from a CSV or the API |
| [embedded-signing.md](embedded-signing.md) | Signing in the customer's iframe, allowed origins, postMessage events |
| [security.md](security.md) | Tenant isolation, tokens, OTP, rate limits, audit integrity, DPA, route checklist |
| [ui.md](ui.md) | coss + Extend only: rules, screen → component map, Extend specifics |
| [testing.md](testing.md) | Test layers, what must be tested, integration conventions |
| [roadmap.md](roadmap.md) | Phased checklist. Agents work top-down |
| [decisions/](decisions/) | Architecture decision records |
