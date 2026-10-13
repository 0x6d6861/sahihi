import { site } from "@/content/site"

export function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-paper/80 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between px-5 md:h-24 md:px-12">
        <a href="/" className="text-[1.375rem] font-semibold tracking-[-0.04em] md:text-[1.625rem]">
          {site.name}
        </a>
        <nav className="text-nav flex items-center gap-7 md:gap-10">
          {site.nav.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="inline-flex h-11 items-center underline decoration-1 underline-offset-[7px] transition-opacity hover:opacity-60"
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  )
}
