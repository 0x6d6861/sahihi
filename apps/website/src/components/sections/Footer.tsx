import { site } from "@/content/site"

export function Footer() {
  return (
    <footer className="flex flex-col items-center justify-between gap-4 px-5 pb-10 text-[0.875rem] font-normal text-muted sm:flex-row md:px-12">
      <span>
        © {site.footer.year} {site.name}
      </span>
      <nav className="flex gap-6">
        {site.footer.links.map((l) => (
          <a key={l.label} href={l.href} className="hover:text-ink">
            {l.label}
          </a>
        ))}
      </nav>
    </footer>
  )
}
