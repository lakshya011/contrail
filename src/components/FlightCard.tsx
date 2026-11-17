import Link from "next/link";
import type { FlightWithAirports } from "@/lib/data";
import { displayFlightNumber } from "@/lib/ingest/types";
import { formatDate, formatDuration, timeOf } from "@/lib/time";
import { fmtDistance } from "@/lib/format";
import { alsoSoldAs, operatedByNote, operatingAirline, primaryNumber } from "@/lib/flight-display";

const STATUS_INK = { upcoming: "text-accent-2", flown: "text-ok", cancelled: "text-danger" } as const;

/** Status as a small ink stamp; extra notes as paper chips. */
export function StatusChip({ status, forOthers, review }: { status: FlightWithAirports["status"]; forOthers?: boolean; review?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className={`stamp rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium ${STATUS_INK[status]}`}>{status}</span>
      {forOthers && <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[11px] text-muted">for someone else</span>}
      {review && <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[11px] font-semibold text-accent">needs review</span>}
    </span>
  );
}

function seatText(f: FlightWithAirports) {
  if (f.mySeat) return f.mySeat;
  if (f.seats?.length > 1) return f.seats.map((x) => x.seat).join(" ");
  return f.seat ?? "—";
}

/** A flight as a torn-off boarding pass: route on the left, stub with seat and status on the right. */
export function FlightCard({ f, units }: { f: FlightWithAirports; units: string }) {
  const dep = timeOf(f.schedDepLocal), arr = timeOf(f.schedArrLocal);
  const nextDay = f.schedArrLocal && f.schedArrLocal.slice(0, 10) > f.depDate;
  const also = alsoSoldAs(f);
  return (
    <Link
      href={`/flights/${f.id}`}
      className={`card group relative grid grid-cols-[minmax(0,1fr)_88px] overflow-hidden transition hover:border-perf hover:bg-panel-hover ${f.status === "cancelled" ? "opacity-60" : ""}`}
    >
      <div className="min-w-0 p-4">
        <div className="flex items-center justify-between gap-2 font-serif text-[11px] uppercase tracking-[0.14em] text-muted">
          <span>Boarding pass</span>
          <span className="shrink-0 normal-case tracking-normal">{formatDate(f.depDate)}</span>
        </div>

        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-end gap-3">
          <div className="min-w-0">
            <div className="font-serif text-4xl leading-none">{f.depIata}</div>
            <div className="mt-1 truncate text-xs text-muted">{f.dep?.city ?? f.dep?.name ?? "Unknown"}</div>
          </div>
          <div className="flex w-20 flex-col items-center pb-5 text-[11px] text-muted sm:w-28">
            <span>{formatDuration(f.durationMin)}</span>
            <div className="relative my-1.5 w-full border-t border-dashed border-perf">
              <svg viewBox="0 0 24 24" className="absolute -top-[9px] left-1/2 h-4 w-4 -translate-x-1/2 rotate-90 bg-panel text-accent group-hover:bg-panel-hover" fill="currentColor" aria-hidden>
                <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
              </svg>
            </div>
            <span>{fmtDistance(f.distanceKm, units)}</span>
          </div>
          <div className="min-w-0 text-right">
            <div className="font-serif text-4xl leading-none">{f.arrIata}</div>
            <div className="mt-1 truncate text-xs text-muted">{f.arr?.city ?? f.arr?.name ?? "Unknown"}</div>
          </div>
        </div>

        <div className="mt-2 flex justify-between font-mono text-sm tabular">
          <span>{dep ?? "--:--"}</span>
          <span>
            {arr ?? "--:--"}
            {nextDay && <sup className="ml-0.5 text-accent">+1</sup>}
          </span>
        </div>

        <div className="perf-x mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-2 text-xs text-muted">
          <span className="min-w-0 truncate">
            <span className="font-mono font-semibold text-text">{displayFlightNumber(primaryNumber(f))}</span>
            {operatingAirline(f).name ? ` · ${operatingAirline(f).name}` : ""}
            {operatedByNote(f) && ` (${operatedByNote(f)})`}
            {also.length > 0 && <span className="ml-1.5 text-[11px]">also {also.map(displayFlightNumber).join(", ")}</span>}
          </span>
          {(f.forOthers || f.needsReview) && <StatusChip status={f.status} forOthers={f.forOthers} review={f.needsReview} />}
        </div>
      </div>

      {/* Stub, with the half-circle notches of a tear line */}
      <div className="perf-y relative flex flex-col items-center justify-between gap-2 bg-panel-2/40 px-2 py-4 text-center">
        <span className="absolute -left-[9px] -top-[9px] h-4 w-4 rounded-full border border-line bg-bg" aria-hidden />
        <span className="absolute -bottom-[9px] -left-[9px] h-4 w-4 rounded-full border border-line bg-bg" aria-hidden />
        <div>
          <div className="font-serif text-[10px] uppercase tracking-[0.14em] text-muted">Seat</div>
          <div className="font-mono text-base leading-tight">{seatText(f)}</div>
        </div>
        {f.pnr && <div className="font-mono text-[10px] text-muted">{f.pnr}</div>}
        <span className={`stamp -rotate-6 rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium ${STATUS_INK[f.status]}`}>{f.status}</span>
      </div>
    </Link>
  );
}
