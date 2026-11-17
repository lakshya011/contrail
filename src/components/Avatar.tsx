"use client";

import { useEffect, useState } from "react";

function initials(name: string | null | undefined, email: string) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0]?.[0] ?? email[0] ?? "?");
  return letters.toUpperCase();
}

/**
 * Ink-stamp initials, replaced by your Google photo only after the photo has actually loaded.
 * (Rendering the <img> straight away showed a broken image when the photo failed before the page's
 * JavaScript was ready to notice.)
 */
export function Avatar({ src, name, email }: { src: string | null; name: string | null; email: string }) {
  const [loaded, setLoaded] = useState<string | null>(null);

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const probe = new Image();
    probe.referrerPolicy = "no-referrer";
    probe.onload = () => {
      if (!cancelled && probe.naturalWidth > 0) setLoaded(src);
    };
    probe.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (loaded && loaded === src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={loaded} alt="" className="h-7 w-7 rounded-full" referrerPolicy="no-referrer" />;
  }
  return (
    <span
      className="flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-accent font-serif text-[11px] font-semibold text-accent"
      aria-hidden
    >
      {initials(name, email)}
    </span>
  );
}
