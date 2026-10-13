import type { Metadata } from "next"
import { Suspense } from "react"
import { CertificateView } from "@/components/verify/CertificateView"
import { site } from "@/content/site"

export const metadata: Metadata = {
  title: "Verify certificate — Sahihi",
  // A certificate's record names its signers: keep it out of search results.
  robots: { index: false, follow: false },
}

/**
 * A certificate's public record, the target of every certificate's QR code. The shell is static;
 * CertificateView reads the code from the URL and fetches the record in the browser.
 */
export default function CertificatePage() {
  const t = site.verify
  return (
    <>
      <h1 className="text-title">{t.title}</h1>
      <Suspense
        fallback={
          <p className="text-caption mt-10 font-normal text-muted">{t.certificate.loading}</p>
        }
      >
        <CertificateView />
      </Suspense>
      <a
        href="/verify"
        className="text-caption mt-8 inline-block underline decoration-1 underline-offset-4 transition-opacity hover:opacity-60"
      >
        {t.certificate.another}
      </a>
    </>
  )
}
