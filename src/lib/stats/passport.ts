import type { FlightWithAirports } from "@/lib/data";
import { EARTH_CIRCUMFERENCE_KM, MOON_DISTANCE_KM } from "@/lib/geo/distance";
import { countryName, flagEmoji } from "@/lib/countries";
import { operatingAirline } from "@/lib/flight-display";

export type Ranked = { key: string; label: string; sub?: string; count: number };

export type Passport = {
  totals: {
    flights: number;
    distanceKm: number;
    durationMin: number;
    airports: number;
    airlines: number;
    countries: number;
    aircraftTypes: number;
    earthLaps: number;
    moonPct: number;
  };
  years: { year: string; flights: number; distanceKm: number }[];
  topAirports: Ranked[];
  topAirlines: Ranked[];
  topRoutes: (Ranked & { distanceKm: number })[];
  /** first = date you first flew into or out of the country (flights are sorted oldest first). */
  countries: (Ranked & { flag: string; first: string })[];
  aircraft: Ranked[];
  records: {
    first: FlightWithAirports | null;
    latest: FlightWithAirports | null;
    longest: FlightWithAirports | null;
    shortest: FlightWithAirports | null;
    busiestYear: { year: string; flights: number } | null;
    busiestMonth: { month: string; flights: number } | null;
    longestGap: { from: string; to: string; days: number } | null;
  };
  habits: {
    seat: { window: number; middle: number; aisle: number };
    cabin: Record<string, number>;
    domestic: number;
    international: number;
    redEyes: number;
    timeOfDay: { morning: number; afternoon: number; evening: number; night: number };
    weekday: number[]; // Mon..Sun
  };
  geo: {
    routes: { from: [number, number]; to: [number, number]; count: number; key: string }[];
    airports: { iata: string; lon: number; lat: number; count: number; city: string | null }[];
  };
};

function rank(map: Map<string, Ranked>, n = 10): Ranked[] {
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, n);
}

function bump(map: Map<string, Ranked>, key: string, label: string, sub?: string) {
  const r = map.get(key) ?? { key, label, sub, count: 0 };
  r.count++;
  map.set(key, r);
}

/**
 * Seat position from the seat letter. Approximate: A/K and F on narrow-bodies are windows,
 * C/D/G/H aisles, B/E/J middles. Without the aircraft layout this is a best guess.
 */
export function seatPosition(seat: string | null): "window" | "middle" | "aisle" | null {
  const l = seat?.match(/[A-K]$/i)?.[0]?.toUpperCase();
  if (!l) return null;
  if ("AFK".includes(l)) return "window";
  if ("CDGH".includes(l)) return "aisle";
  return "middle";
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

/** Lifetime (or per-year) travel stats from flown flights, sorted oldest first. */
export function computePassport(flights: FlightWithAirports[], year?: string): Passport {
  const fs = year ? flights.filter((f) => f.depDate.startsWith(year)) : flights;

  const airports = new Map<string, Ranked>(), airlines = new Map<string, Ranked>(), routes = new Map<string, Ranked & { distanceKm: number }>();
  const countries = new Map<string, Ranked>(), aircraft = new Map<string, Ranked>();
  const countryFirst = new Map<string, string>();
  const years = new Map<string, { year: string; flights: number; distanceKm: number }>();
  const months = new Map<string, number>();
  const cabin: Record<string, number> = {};
  const seat = { window: 0, middle: 0, aisle: 0 };
  const timeOfDay = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  const weekday = [0, 0, 0, 0, 0, 0, 0];
  const geoRoutes = new Map<string, Passport["geo"]["routes"][number]>();
  const geoAirports = new Map<string, Passport["geo"]["airports"][number]>();
  let distanceKm = 0, durationMin = 0, domestic = 0, international = 0, redEyes = 0;

  for (const f of fs) {
    distanceKm += f.distanceKm ?? 0;
    durationMin += f.durationMin ?? 0;

    for (const a of [f.dep, f.arr]) {
      if (!a) continue;
      bump(airports, a.iata, a.iata, a.city ?? a.name);
      const g = geoAirports.get(a.iata) ?? { iata: a.iata, lon: a.lon, lat: a.lat, count: 0, city: a.city };
      g.count++;
      geoAirports.set(a.iata, g);
    }
    const visited = new Set([f.dep?.country, f.arr?.country].filter((c): c is string => !!c));
    for (const c of visited) {
      bump(countries, c, countryName(c));
      if (!countryFirst.has(c)) countryFirst.set(c, f.depDate);
    }

    // Group by airline name so one airline flown under two codes (I5 became IX) counts once.
    // Codeshares count for the airline that actually flew you.
    const op = operatingAirline(f);
    const al = op.iata ?? f.flightNumber.slice(0, 2);
    const alName = op.name ?? al;
    bump(airlines, alName.toLowerCase(), alName);
    const alRow = airlines.get(alName.toLowerCase())!;
    const codes = new Set((alRow.sub ?? "").split(" · ").filter(Boolean));
    codes.add(al);
    alRow.sub = [...codes].join(" · ");
    if (f.aircraftType) bump(aircraft, f.aircraftType, f.aircraftType);

    const [a, b] = [f.depIata, f.arrIata].sort();
    const rk = `${a}-${b}`;
    const r = routes.get(rk) ?? { key: rk, label: `${a} ↔ ${b}`, count: 0, distanceKm: f.distanceKm ?? 0 };
    r.count++;
    routes.set(rk, r);
    if (f.dep && f.arr) {
      const gr = geoRoutes.get(rk) ?? { key: rk, from: [f.dep.lon, f.dep.lat] as [number, number], to: [f.arr.lon, f.arr.lat] as [number, number], count: 0 };
      gr.count++;
      geoRoutes.set(rk, gr);
    }

    const y = f.depDate.slice(0, 4);
    const ye = years.get(y) ?? { year: y, flights: 0, distanceKm: 0 };
    ye.flights++;
    ye.distanceKm += f.distanceKm ?? 0;
    years.set(y, ye);
    months.set(f.depDate.slice(0, 7), (months.get(f.depDate.slice(0, 7)) ?? 0) + 1);

    if (f.cabin) cabin[f.cabin] = (cabin[f.cabin] ?? 0) + 1;
    const pos = seatPosition(f.mySeat); // only your own seat, never a companion's
    if (pos) seat[pos]++;
    if (f.dep && f.arr) {
      if (f.dep.country === f.arr.country) domestic++;
      else international++;
    }

    const hour = f.schedDepLocal ? Number(f.schedDepLocal.slice(11, 13)) : null;
    if (hour != null) {
      if (hour >= 5 && hour < 12) timeOfDay.morning++;
      else if (hour >= 12 && hour < 17) timeOfDay.afternoon++;
      else if (hour >= 17 && hour < 21) timeOfDay.evening++;
      else timeOfDay.night++;
      if ((hour >= 21 || hour < 5) && (f.durationMin ?? 0) >= 180) redEyes++;
    }
    weekday[(new Date(`${f.depDate}T00:00:00Z`).getUTCDay() + 6) % 7]++;
  }

  const withDist = fs.filter((f) => f.distanceKm != null);
  const byDist = [...withDist].sort((a, b) => a.distanceKm! - b.distanceKm!);
  let longestGap: Passport["records"]["longestGap"] = null;
  for (let i = 1; i < fs.length; i++) {
    const d = daysBetween(fs[i - 1].depDate, fs[i].depDate);
    if (!longestGap || d > longestGap.days) longestGap = { from: fs[i - 1].depDate, to: fs[i].depDate, days: d };
  }
  const busiestYear = [...years.values()].sort((a, b) => b.flights - a.flights)[0];
  const busiestMonth = [...months.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    totals: {
      flights: fs.length,
      distanceKm: Math.round(distanceKm),
      durationMin,
      airports: airports.size,
      airlines: airlines.size,
      countries: countries.size,
      aircraftTypes: aircraft.size,
      earthLaps: distanceKm / EARTH_CIRCUMFERENCE_KM,
      moonPct: (distanceKm / MOON_DISTANCE_KM) * 100,
    },
    years: [...years.values()].sort((a, b) => a.year.localeCompare(b.year)),
    topAirports: rank(airports),
    topAirlines: rank(airlines),
    topRoutes: [...routes.values()].sort((a, b) => b.count - a.count || b.distanceKm - a.distanceKm).slice(0, 10),
    countries: rank(countries, 100).map((c) => ({ ...c, flag: flagEmoji(c.key), first: countryFirst.get(c.key)! })),
    aircraft: rank(aircraft),
    records: {
      first: fs[0] ?? null,
      latest: fs[fs.length - 1] ?? null,
      longest: byDist[byDist.length - 1] ?? null,
      shortest: byDist[0] ?? null,
      busiestYear: busiestYear ? { year: busiestYear.year, flights: busiestYear.flights } : null,
      busiestMonth: busiestMonth ? { month: busiestMonth[0], flights: busiestMonth[1] } : null,
      longestGap,
    },
    habits: { seat, cabin, domestic, international, redEyes, timeOfDay, weekday },
    geo: { routes: [...geoRoutes.values()], airports: [...geoAirports.values()] },
  };
}
