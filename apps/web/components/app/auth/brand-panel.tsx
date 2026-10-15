import { AuthAside } from "@/components/app/auth/auth-shell"
import { Badge } from "@/components/app/badge"
import { CheckIcon, CircleCheckIcon, ShieldCheckIcon } from "@/components/app/icons"
import { Progress } from "@/components/arc/progress/progress"
import { BRAND } from "@/lib/brand"

const SIGNERS = [
  { initials: "AO", name: "Achieng Otieno" },
  { initials: "BM", name: "Baraka Mwangi" },
]

/**
 * The right half of the auth pages from `lg`: the tagline and two sample cards (an envelope on its
 * way, a verified certificate) showing what Sahihi produces. Decorative, so hidden from assistive tech
 * except the tagline.
 */
export function BrandPanel() {
  return (
    <AuthAside className="justify-between">
      <div className="flex flex-col gap-4">
        <p className="max-w-md text-balance font-medium text-4xl text-foreground tracking-tight 2xl:text-5xl">
          {BRAND.tagline}
        </p>
        <p className="max-w-md text-muted-foreground">{BRAND.lede}</p>
      </div>

      <div className="flex w-full max-w-md flex-col gap-3" aria-hidden>
        <div className="flex flex-col gap-3 rounded-2xl bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate font-medium text-sm">Offer letter, Juma Ochieng</span>
            <Badge tone="info" size="sm">
              In progress
            </Badge>
          </div>
          <Progress value={50} />
          <span className="text-muted-foreground text-xs">1 of 2 signed · Juma opened it</span>
        </div>

        <div className="flex flex-col overflow-hidden rounded-2xl bg-card">
          <div className="flex items-center gap-2 bg-success/10 px-4 py-2.5 text-xs">
            <CircleCheckIcon className="size-3.5 text-success-foreground" />
            <span className="font-medium text-success-foreground">Certificate verified</span>
            <span className="ml-auto font-mono text-muted-foreground">5XV2-MEVQ-Q84C</span>
          </div>
          <div className="flex flex-col gap-2.5 p-4">
            <span className="font-medium text-lg">Mutual NDA, Kilima Agro</span>
            {SIGNERS.map((s) => (
              <div key={s.initials} className="flex items-center gap-2.5 text-sm">
                <span className="grid size-6 place-items-center rounded-full bg-muted font-medium text-xs">
                  {s.initials}
                </span>
                {s.name}
                <CheckIcon className="size-3.5 text-success-foreground" />
                <span className="ml-auto text-muted-foreground text-xs">13 Oct, 17:35</span>
              </div>
            ))}
            <div className="flex items-center gap-2 rounded-lg bg-muted px-2.5 py-2 text-xs">
              <span className="text-muted-foreground">SHA-256</span>
              <span className="truncate font-mono">b051978d9c8c8878…8306acb3afa</span>
            </div>
          </div>
        </div>
      </div>

      <p className="flex items-center gap-2 text-muted-foreground text-sm">
        <ShieldCheckIcon className="size-4" />
        {BRAND.footnote}
      </p>
    </AuthAside>
  )
}
