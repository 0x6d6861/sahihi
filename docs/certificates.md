# Certificates & verification

## v1: Certificate of Completion (INTERNAL provider)

Every completed envelope gets `certificate.pdf`, rendered by `packages/pdf/src/certificate.ts`. It
is stored **separately** from `signed.pdf` so it can quote the signed document's hash.

Contents:

- Envelope title and id, organization, sender, document name and page count
- **Original SHA-256** (hashed at upload) and **signed SHA-256** (after stamping and sealing)
- Signing provider (`INTERNAL` or `CA`) and **audit chain head hash**
- Per signer: name, email, phone, role, verification method, IP, user agent, viewed/signed times (UTC)
- Full event history (time, event, actor, IP)
- Verification code (e.g. `K7QM-2XDP-9RTA`, unambiguous alphabet) with a QR code pointing to
  `${WEB_URL}/verify/<code>`

What this proves: who signed, when, how they were identified, and that the files haven't changed
since (hash comparison). What it **doesn't** provide is a cryptographic signature from a trusted third
party. That's the CA integration below.

## Verification

- `GET /api/verify/:code` returns certificate metadata, hashes and signers (emails masked).
  Page: `apps/web/app/verify/[code]`.
- `POST /api/verify/hash { sha256 }` reports whether a hash matches a signed document or a
  certificate we issued. The **browser hashes the file locally** (Web Crypto) and only the hash
  leaves the device. The "drop a PDF to verify" UI is roadmap P4 (Extend `FileUpload`).
- Both are public and rate-limited.

## CA integration (later)

`packages/core/src/signing-provider.ts`:

```ts
interface SigningProvider {
  readonly kind: "INTERNAL" | "CA"
  seal(stampedPdf: Uint8Array, evidence: EnvelopeEvidence): Promise<SealResult>
}
```

The finalize job calls only `getSigningProvider().seal(...)` (`apps/worker/src/providers/index.ts`),
and `SIGNING_PROVIDER=internal|ca` selects the implementation. To integrate a CA:

1. Choose a licensed provider. In Kenya that means an **Electronic Certification Service Provider**
   licensed by the Communications Authority. Confirm whether their API offers **remote signing**
   (a hash sent over, a CMS signature returned) or requires an HSM or token on our side.
2. Implement `CaSigningProvider.seal`:
   - prepare the PDF with a signature placeholder (`/ByteRange`, `/Contents`). Use a library
     such as `@signpdf/*`, or the provider's SDK
   - compute the ByteRange digest and send it to the CA with the signer or organization identity
   - embed the returned CMS/PKCS#7 signature, aiming for **PAdES-B-LT** (include OCSP/CRL + an RFC
     3161 timestamp for long-term validation)
   - return `{ pdf, provider: "CA", providerRef: <transaction id / cert serial> }`
3. Decide the model: **one organization seal** per document (simplest), or **per-signer
   certificates** (a signer identity check with the CA; this changes the signing UX).
4. Add CA env vars to `packages/config` + `.env.example`. Store `providerRef` on `Certificate`.
5. The certificate PDF already shows the provider. Add the CA certificate subject and serial.
6. Tests: seal a fixture and verify it with an independent validator (e.g. `pdfsig`, or EU DSS in CI).

Nothing outside `providers/` and `certificate.ts` should need to change. If it does, write an ADR.
