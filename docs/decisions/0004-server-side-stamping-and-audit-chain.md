# 0004: Server-side stamping, hashed originals and a hash-chained audit log

- **Status:** accepted
- **Date:** 2026-09-26

## Context
A signed document is evidence. Client-produced PDFs can't be trusted, and a mutable audit table is
weak evidence.

## Decision
- Browsers submit values only. The worker stamps them into the immutable original with pdf-lib,
  after re-verifying the original's SHA-256.
- Every state change appends an `AuditEvent` in the same transaction, chained by SHA-256 and
  serialized with a Postgres advisory lock per envelope.
- The certificate prints the original hash, signed hash and audit chain head.

## Consequences
- Tampering with files or the log is detectable.
- Finalization is asynchronous (seconds), so the UI shows "finalizing" briefly after the last signature.
- Stamping must handle rotated and cropped pages correctly (tested in core + pdf).
