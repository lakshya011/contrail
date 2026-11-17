"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type Slide = { kicker: string; big: string; text: string };

export function YearStory({ year, slides }: { year: string; slides: Slide[] }) {
  const [i, setI] = useState(0);
  const last = slides.length - 1;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") setI((x) => Math.min(last, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last]);
  const s = slides[i];
  return (
    <div className="mx-auto max-w-md">
      <div className="mb-3 flex gap-1" aria-hidden>
        {slides.map((_, k) => <div key={k} className={`h-1 flex-1 rounded-full ${k <= i ? "bg-accent" : "bg-panel-2"}`} />)}
      </div>
      <button
        onClick={() => setI((x) => (x < last ? x + 1 : x))}
        className="card relative flex aspect-[9/14] w-full flex-col justify-between overflow-hidden p-8 text-left"
        aria-label="Next"
      >
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-30" viewBox="0 0 300 460" aria-hidden>
          <path d={`M-20 ${380 - i * 20} C 100 ${300 - i * 15}, 180 ${160 + i * 10}, 330 ${60 + i * 8}`} stroke="var(--accent)" strokeWidth="2" strokeDasharray="6 5" fill="none" />
        </svg>
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">{year} · {s.kicker}</span>
        <div>
          <div className="font-serif text-6xl leading-none tracking-tight">{s.big}</div>
          <p className="mt-4 text-lg text-muted">{s.text}</p>
        </div>
        <span className="text-xs text-muted">{i < last ? "Tap to continue" : "That was your year in the air"}</span>
      </button>
      <div className="mt-4 flex justify-between">
        <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>Back</button>
        {i === last ? (
          <a className="btn btn-primary" href={`/api/passport/card?year=${year}`} target="_blank" rel="noreferrer">Get share card</a>
        ) : (
          <Link className="btn" href={`/passport?year=${year}`}>Skip</Link>
        )}
      </div>
    </div>
  );
}
