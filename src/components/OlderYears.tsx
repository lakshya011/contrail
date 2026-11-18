"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { YearHeading } from "@/components/FlightYearSection";

export type YearSummary = { year: string; count: number; flown: number };

/**
 * Older years of the Flights page, fetched one at a time as you scroll near them, so the first view
 * only carries the recent flights. Each waiting year shows its heading and a "Show" button as a fallback.
 */
export function OlderYears({ years, loadYearAction }: { years: YearSummary[]; loadYearAction: (year: string) => Promise<ReactNode> }) {
  const [loaded, setLoaded] = useState<ReactNode[]>([]);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);
  const next = years[loaded.length];

  const loadNext = () => {
    if (!next || pending) return;
    setFailed(false);
    startTransition(async () => {
      try {
        const node = await loadYearAction(next.year);
        setLoaded((prev) => [...prev, node]);
      } catch {
        setFailed(true);
      }
    });
  };

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !next || failed) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadNext(), { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
    // loadNext reads the latest state through `next`/`pending`; re-observe when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next?.year, pending, failed]);

  return (
    <>
      {loaded.map((node, i) => <div key={years[i].year}>{node}</div>)}
      {next && (
        <section ref={sentinel} aria-busy={pending}>
          <YearHeading year={next.year} flown={next.flown} />
          <div className="card flex items-center justify-between gap-3 p-4 text-sm text-muted">
            <span>
              {failed ? "Couldn't load these flights." : pending ? `Loading ${next.count} flights…` : `${next.count} flights`}
              {years.length - loaded.length > 1 && ` · ${years.length - loaded.length - 1} more years below`}
            </span>
            <button type="button" className="btn shrink-0" onClick={loadNext} disabled={pending}>
              {failed ? "Try again" : `Show ${next.year}`}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
