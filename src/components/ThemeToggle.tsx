"use client";

import { useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";
const NEXT: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<ThemeChoice, string> = { system: "Automatic", light: "Day", dark: "Night" };

/** Cycles automatic → day → night. Saved in a cookie so the server renders the right theme with no flash. */
export function ThemeToggle({ initial }: { initial: ThemeChoice }) {
  const [choice, setChoice] = useState<ThemeChoice>(initial);
  const next = NEXT[choice];

  const apply = () => {
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
    if (next === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    window.dispatchEvent(new Event("contrail-theme"));
    setChoice(next);
  };

  return (
    <button
      onClick={apply}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted transition hover:bg-panel-2 hover:text-text"
      aria-label={`Theme: ${LABEL[choice]}. Switch to ${LABEL[next]}`}
      title={`${LABEL[choice]} theme (click for ${LABEL[next].toLowerCase()})`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {choice === "light" && (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        )}
        {choice === "dark" && <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />}
        {choice === "system" && (
          <>
            <circle cx="12" cy="12" r="8" />
            <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
          </>
        )}
      </svg>
    </button>
  );
}
