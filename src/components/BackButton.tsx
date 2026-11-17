"use client";

import { useRouter } from "next/navigation";
import { NAV_DEPTH_KEY } from "./NavTracker";

/**
 * Goes back to where you came from (keeping your search, year filter and scroll position).
 * Opened directly from a link or bookmark, it goes to `fallback` instead.
 */
export function BackButton({ fallback = "/", label = "Flights" }: { fallback?: string; label?: string }) {
  const router = useRouter();
  const goBack = () => {
    let depth = 0;
    try {
      depth = Number(sessionStorage.getItem(NAV_DEPTH_KEY) ?? "0");
    } catch {
      /* storage unavailable */
    }
    if (depth > 1) router.back();
    else router.push(fallback);
  };
  return (
    <button onClick={goBack} className="btn gap-1.5 py-1.5 pl-2.5 pr-3.5 font-medium text-muted hover:text-text">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {label}
    </button>
  );
}
