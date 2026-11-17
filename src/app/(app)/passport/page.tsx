import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { passportFlights } from "@/lib/data";
import { computePassport, type Ranked } from "@/lib/stats/passport";
import { displayFlightNumber } from "@/lib/ingest/types";
import { formatDate } from "@/lib/time";
import { CABIN_LABEL, fmtDistance, fmtHours, fmtNumber } from "@/lib/format";
import { kmToMi } from "@/lib/geo/distance";
import { RouteMap } from "@/components/RouteMap";
import { CountryStamp } from "@/components/Stamp";

function Bars({ items, max, suffix = "" }: { items: { label: React.ReactNode; sub?: React.ReactNode; count: number; key: string }[]; max?: number; suffix?: string }) {
  const m = max ?? Math.max(1, ...items.map((i) => i.count));
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.key}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate">{i.label} {i.sub && <span className="text-xs text-muted">{i.sub}</span>}</span>
            <span className="tabular text-muted">{i.count}{suffix}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-panel-2">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(i.count / m) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`}>
      <h2 className="mb-4 font-serif text-xs uppercase tracking-[0.18em] text-muted">{title}</h2>
      {children}
    </section>
  );
}

const rankedBars = (r: Ranked[]) => r.map((x) => ({ key: x.key, label: x.label, sub: x.sub && x.sub !== x.label ? x.sub : undefined, count: x.count }));

export default async function PassportPage({ searchParams }: PageProps<"/passport">) {
  const user = await requireUser();
  const sp = await searchParams;
  const flights = await passportFlights(user);
  const allYears = [...new Set(flights.map((f) => f.depDate.slice(0, 4)))].sort();
  const year = typeof sp.year === "string" && allYears.includes(sp.year) ? sp.year : undefined;
  const p = computePassport(flights, year);
  const t = p.totals;
  const dist = user.units === "mi" ? kmToMi(t.distanceKm) : t.distanceKm;
  const maxYear = Math.max(1, ...p.years.map((y) => y.flights));
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const seatTotal = p.habits.seat.window + p.habits.seat.middle + p.habits.seat.aisle;

  const headline: [string, string, string?][] = [
    ["Flights", fmtNumber(t.flights)],
    ["Distance", `${fmtNumber(dist)} ${user.units}`, `${fmtNumber(t.earthLaps, 1)}× around the Earth`],
    ["Time in the air", fmtHours(t.durationMin), `${fmtNumber(t.durationMin / 60)} hours`],
    ["Airports", fmtNumber(t.airports)],
    ["Airlines", fmtNumber(t.airlines)],
    ["Countries", fmtNumber(t.countries)],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-serif text-xs uppercase tracking-[0.3em] text-accent">Passport</p>
          <h1 className="font-serif text-4xl tracking-tight">{year ? `${year} in the air` : "All-time travel"}</h1>
          <p className="text-sm text-muted">
            {p.records.first ? `Since ${formatDate(p.records.first.depDate, { month: "long", year: "numeric" })}` : "No flown flights yet"}
            {t.moonPct > 0 && ` · ${fmtNumber(t.moonPct, 1)}% of the way to the Moon`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn" href={`/api/passport/card${year ? `?year=${year}` : ""}`} target="_blank" rel="noreferrer">Share card</a>
          {year && <Link className="btn btn-primary" href={`/passport/year/${year}`}>Year in Review</Link>}
        </div>
      </div>

      <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1" aria-label="Year">
        <Link href="/passport" className={`shrink-0 rounded-full px-3 py-1 text-sm ${!year ? "bg-accent font-semibold text-[var(--on-accent)]" : "bg-panel-2 text-muted hover:text-text"}`}>All time</Link>
        {allYears.map((y) => (
          <Link key={y} href={`/passport?year=${y}`} className={`shrink-0 rounded-full px-3 py-1 text-sm tabular ${year === y ? "bg-accent font-semibold text-[var(--on-accent)]" : "bg-panel-2 text-muted hover:text-text"}`}>{y}</Link>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {headline.map(([k, v, sub]) => (
          <div key={k} className="card p-4">
            <div className="text-xs text-muted">{k}</div>
            <div className="mt-1 font-serif text-3xl tracking-tight tabular">{v}</div>
            {sub && <div className="mt-0.5 text-[11px] text-accent-2">{sub}</div>}
          </div>
        ))}
      </div>

      <RouteMap routes={p.geo.routes} airports={p.geo.airports} className="h-[360px] sm:h-[480px]" />

      {p.countries.length > 0 && (
        <section className="card overflow-hidden p-5">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-serif text-xs uppercase tracking-[0.18em] text-muted">Stamps</h2>
            <span className="font-serif text-sm text-muted">{p.countries.length} {p.countries.length === 1 ? "country" : "countries"}</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-5 py-4">
            {[...p.countries].sort((a, b) => a.first.localeCompare(b.first)).map((c) => (
              <CountryStamp key={c.key} code={c.key} name={c.label} first={c.first} count={c.count} />
            ))}
          </div>
        </section>
      )}

      {!year && p.years.length > 0 && (
        <Panel title="Flights per year">
          <div className="flex h-40 items-end gap-2">
            {p.years.map((y) => (
              <Link key={y.year} href={`/passport?year=${y.year}`} className="group flex flex-1 flex-col items-center gap-1">
                <span className="text-[11px] tabular text-muted group-hover:text-text">{y.flights}</span>
                <div className="w-full rounded-t-md bg-accent/80 group-hover:bg-accent" style={{ height: `${(y.flights / maxYear) * 110}px` }} />
                <span className="text-[11px] tabular text-muted">{`'${y.year.slice(2)}`}</span>
              </Link>
            ))}
          </div>
        </Panel>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Panel title="Top airports"><Bars items={rankedBars(p.topAirports)} /></Panel>
        <Panel title="Top airlines"><Bars items={rankedBars(p.topAirlines)} /></Panel>
        <Panel title="Top routes"><Bars items={p.topRoutes.map((r) => ({ key: r.key, label: r.label, sub: fmtDistance(r.distanceKm, user.units), count: r.count }))} /></Panel>
        <Panel title={`Countries · ${p.countries.length}`}>
          <ul className="flex flex-wrap gap-2">
            {p.countries.map((c) => (
              <li key={c.key} className="flex items-center gap-1.5 rounded-full bg-panel-2 px-3 py-1 text-sm">
                <span aria-hidden>{c.flag}</span>{c.label}<span className="text-xs text-muted tabular">{c.count}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Aircraft">
          {p.aircraft.length ? <Bars items={rankedBars(p.aircraft)} /> : <p className="text-sm text-muted">Aircraft types appear when your emails or edits include them.</p>}
        </Panel>
        <Panel title="Records">
          <dl className="space-y-3 text-sm">
            {([
              ["First flight", p.records.first && `${p.records.first.depIata} → ${p.records.first.arrIata} · ${formatDate(p.records.first.depDate)}`, p.records.first?.id],
              ["Longest flight", p.records.longest && `${p.records.longest.depIata} → ${p.records.longest.arrIata} · ${fmtDistance(p.records.longest.distanceKm, user.units)}`, p.records.longest?.id],
              ["Shortest flight", p.records.shortest && `${p.records.shortest.depIata} → ${p.records.shortest.arrIata} · ${fmtDistance(p.records.shortest.distanceKm, user.units)}`, p.records.shortest?.id],
              ["Busiest year", p.records.busiestYear && `${p.records.busiestYear.year} · ${p.records.busiestYear.flights} flights`],
              ["Busiest month", p.records.busiestMonth && `${formatDate(`${p.records.busiestMonth.month}-01`, { month: "long", year: "numeric" })} · ${p.records.busiestMonth.flights} flights`],
              ["Longest time grounded", p.records.longestGap && `${p.records.longestGap.days} days`],
            ] as [string, string | null, string?][]).map(([k, v, id]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right">{v ? (id ? <Link href={`/flights/${id}`} className="hover:text-accent">{v}</Link> : v) : "—"}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title="Seat habits">
          {seatTotal ? (
            <>
              <div className="flex h-3 overflow-hidden rounded-full">
                <div className="bg-accent" style={{ width: `${(p.habits.seat.window / seatTotal) * 100}%` }} />
                <div className="bg-perf" style={{ width: `${(p.habits.seat.middle / seatTotal) * 100}%` }} />
                <div className="bg-accent-2" style={{ width: `${(p.habits.seat.aisle / seatTotal) * 100}%` }} />
              </div>
              <div className="mt-3 flex justify-between text-sm">
                <span><span className="text-accent">●</span> Window {p.habits.seat.window}</span>
                <span><span className="text-perf">●</span> Middle {p.habits.seat.middle}</span>
                <span><span className="text-accent-2">●</span> Aisle {p.habits.seat.aisle}</span>
              </div>
              <p className="mt-2 text-[11px] text-muted">Estimated from seat letters.</p>
            </>
          ) : <p className="text-sm text-muted">No seat numbers found yet.</p>}
          <div className="mt-5 space-y-1 text-sm">
            {Object.entries(p.habits.cabin).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
              <div key={c} className="flex justify-between"><span>{CABIN_LABEL[c] ?? c}</span><span className="tabular text-muted">{n}</span></div>
            ))}
          </div>
        </Panel>
        <Panel title="When you fly">
          <Bars max={Math.max(1, ...Object.values(p.habits.timeOfDay))} items={[
            { key: "m", label: "Morning", sub: "5–12", count: p.habits.timeOfDay.morning },
            { key: "a", label: "Afternoon", sub: "12–17", count: p.habits.timeOfDay.afternoon },
            { key: "e", label: "Evening", sub: "17–21", count: p.habits.timeOfDay.evening },
            { key: "n", label: "Night", sub: "21–5", count: p.habits.timeOfDay.night },
          ]} />
          <div className="mt-5 flex h-20 items-end gap-1.5">
            {p.habits.weekday.map((n, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-t bg-accent-2/80" style={{ height: `${(n / Math.max(1, ...p.habits.weekday)) * 56}px` }} />
                <span className="text-[10px] text-muted">{weekdays[i]}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Kinds of trips">
          <div className="grid grid-cols-3 gap-2 text-center">
            {([["Domestic", p.habits.domestic], ["International", p.habits.international], ["Red-eyes", p.habits.redEyes]] as const).map(([k, v]) => (
              <div key={k} className="rounded-xl bg-panel-2 p-3">
                <div className="text-2xl font-semibold tabular">{v}</div>
                <div className="text-[11px] text-muted">{k}</div>
              </div>
            ))}
          </div>
          {p.records.latest && (
            <p className="mt-4 text-sm text-muted">
              Latest: <Link className="text-text hover:text-accent" href={`/flights/${p.records.latest.id}`}>{displayFlightNumber(p.records.latest.flightNumber)} {p.records.latest.depIata} → {p.records.latest.arrIata}</Link> on {formatDate(p.records.latest.depDate)}
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
