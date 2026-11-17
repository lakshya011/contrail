"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export const NAV_DEPTH_KEY = "contrail-nav-depth";

/** Counts pages visited inside the app this tab session, so Back knows it can safely go back. */
export function NavTracker() {
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    try {
      const depth = Number(sessionStorage.getItem(NAV_DEPTH_KEY) ?? "0");
      sessionStorage.setItem(NAV_DEPTH_KEY, String(depth + 1));
    } catch {
      /* storage unavailable: Back falls back to the list */
    }
  }, [pathname, search]);
  return null;
}
