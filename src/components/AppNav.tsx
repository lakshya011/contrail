"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Flights", icon: "M2 16l20-7-20-7v5l14 2-14 2z" },
  { href: "/passport", label: "Passport", icon: "M6 2h12a2 2 0 012 2v16a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm6 5a4 4 0 100 8 4 4 0 000-8zM8 18h8" },
  { href: "/review", label: "Review", icon: "M9 11l3 3 8-8M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9" },
  { href: "/settings", label: "Settings", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" },
];

function active(path: string, href: string) {
  return href === "/" ? path === "/" || path.startsWith("/flights") : path.startsWith(href);
}

export function TopNav({ reviewCount }: { reviewCount: number }) {
  const path = usePathname();
  return (
    <nav className="hidden sm:flex items-center gap-1">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`relative rounded-full px-4 py-1.5 text-sm font-medium transition ${active(path, l.href) ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}
        >
          {l.label}
          {l.href === "/review" && reviewCount > 0 && (
            <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[10px] font-bold text-[var(--on-accent)] tabular">{reviewCount}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav({ reviewCount }: { reviewCount: number }) {
  const path = usePathname();
  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 border-t border-line bg-bg/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={`relative flex flex-col items-center gap-1 py-2.5 text-[11px] ${active(path, l.href) ? "text-accent" : "text-muted"}`}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={l.icon} />
            </svg>
            {l.label}
            {l.href === "/review" && reviewCount > 0 && (
              <span className="absolute top-1.5 left-1/2 ml-2 rounded-full bg-accent px-1 text-[9px] font-bold text-[var(--on-accent)]">{reviewCount}</span>
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}
