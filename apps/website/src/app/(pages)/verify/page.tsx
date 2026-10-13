import type { Metadata } from "next"
import { VerifyChecker } from "@/components/verify/VerifyChecker"
import { site } from "@/content/site"

export const metadata: Metadata = {
  title: "Verify a document — Sahihi",
  description: site.verify.intro,
}

/** Public: check a signed PDF or certificate, without an account. */
export default function VerifyPage() {
  const t = site.verify
  return (
    <>
      <h1 className="text-title">{t.title}</h1>
      <p className="text-caption mt-4 font-normal text-muted">{t.intro}</p>
      <VerifyChecker />
      <ul className="mt-14 flex flex-col gap-4">
        {t.how.map((h) => (
          <li key={h.lead} className="text-caption font-normal text-muted">
            <span className="font-medium text-ink">{h.lead}</span> {h.text}
          </li>
        ))}
      </ul>
    </>
  )
}
