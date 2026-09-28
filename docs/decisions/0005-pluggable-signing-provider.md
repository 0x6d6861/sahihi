# 0005: Pluggable SigningProvider for future CA integration

- **Status:** accepted
- **Date:** 2026-09-26

## Context
v1 issues a Certificate of Completion (simple electronic signature + evidence). Later we'll integrate
a licensed Certification Service Provider for PAdES digital signatures (advanced signatures).

## Decision
The finalize job calls `SigningProvider.seal(stampedPdf, evidence)` only. `INTERNAL` returns the bytes
unchanged; `CA` will embed a PAdES-B-LT signature. Selected by `SIGNING_PROVIDER`.

## Consequences
- The CA work is isolated to `apps/worker/src/providers/` and certificate rendering.
- Per-signer CA certificates (vs one org seal) would change the signing UX. Decide when choosing
  the provider.
