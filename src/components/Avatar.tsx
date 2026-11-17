"use client";

import { useState } from "react";

function initials(name: string | null | undefined, email: string) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0]?.[0] ?? email[0] ?? "?");
  return letters.toUpperCase();
}

/** Your Google photo, or ink-stamp initials if there is none or it fails to load. */
export function Avatar({ src, name, email }: { src: string | null; name: string | null; email: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className="h-7 w-7 rounded-full" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    );
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
