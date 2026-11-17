/**
 * Loads airports and airlines into the database (run once, safe to re-run).
 * Airports: mwgg/Airports (MIT) – includes IATA, coordinates, country and IANA timezone.
 * Airline service: OurAirports airports.csv (public domain) – marks airports with scheduled flights,
 *   so a misread code like BLU (a Californian airstrip) can be caught and corrected to BLR.
 * Airlines: OpenFlights airlines.dat (ODbL).
 */
import "./env";
import { sql } from "drizzle-orm";
import { getDb, schema } from "../src/db/client";

const AIRPORTS_URL = "https://raw.githubusercontent.com/mwgg/Airports/master/airports.json";
const OURAIRPORTS_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const AIRLINES_URL = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat";

type RawAirport = {
  icao: string; iata: string; name: string; city: string; country: string;
  lat: number; lon: number; tz: string;
};

function parseDatLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === "," && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((v) => (v === "\\N" ? "" : v));
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  return rows;
}

type OurAirport = { iata: string; icao: string | null; name: string; city: string | null; country: string; lat: number; lon: number; sched: boolean };

async function loadOurAirports(): Promise<Map<string, OurAirport>> {
  const [header, ...rows] = parseCsv(await (await fetch(OURAIRPORTS_URL)).text());
  const ix = Object.fromEntries(header.map((k, i) => [k, i]));
  const out = new Map<string, OurAirport>();
  for (const r of rows) {
    const iata = r[ix.iata_code];
    if (!/^[A-Z]{3}$/.test(iata ?? "")) continue;
    const rec: OurAirport = {
      iata, icao: r[ix.icao_code] || null, name: r[ix.name], city: r[ix.municipality] || null, country: r[ix.iso_country],
      lat: Number(r[ix.latitude_deg]), lon: Number(r[ix.longitude_deg]), sched: r[ix.scheduled_service] === "yes",
    };
    const prev = out.get(iata);
    if (!prev || (!prev.sched && rec.sched)) out.set(iata, rec);
  }
  return out;
}

async function chunked<T>(rows: T[], size: number, fn: (c: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

async function main() {
  const db = await getDb();

  console.log("Fetching airports…");
  const raw = (await (await fetch(AIRPORTS_URL)).json()) as Record<string, RawAirport>;
  const seen = new Set<string>();
  console.log("Fetching airline-service data…");
  const our = await loadOurAirports();
  const airportRows = Object.values(raw)
    .filter((a) => /^[A-Z]{3}$/.test(a.iata ?? "") && !seen.has(a.iata) && seen.add(a.iata))
    .map((a) => ({
      iata: a.iata, icao: a.icao || null, name: a.name, city: a.city || null,
      country: a.country, lat: Number(a.lat), lon: Number(a.lon), tz: a.tz || null,
      scheduled: our.get(a.iata)?.sched ?? null,
    }));
  // Airports with airline service that the first list lacks (no timezone known for these).
  for (const o of our.values()) {
    if (!o.sched || seen.has(o.iata)) continue;
    seen.add(o.iata);
    airportRows.push({ iata: o.iata, icao: o.icao, name: o.name, city: o.city, country: o.country, lat: o.lat, lon: o.lon, tz: null, scheduled: true });
  }
  await chunked(airportRows, 500, (c) =>
    db.insert(schema.airports).values(c).onConflictDoUpdate({
      target: schema.airports.iata,
      set: {
        icao: sql`excluded.icao`, name: sql`excluded.name`, city: sql`excluded.city`,
        country: sql`excluded.country`, lat: sql`excluded.lat`, lon: sql`excluded.lon`, tz: sql`excluded.tz`,
        scheduled: sql`excluded.scheduled`,
      },
    }),
  );
  console.log(`Airports: ${airportRows.length}`);

  console.log("Fetching airlines…");
  const lines = (await (await fetch(AIRLINES_URL)).text()).split("\n").filter(Boolean);
  // Columns: id, name, alias, IATA, ICAO, callsign, country, active
  const byIata = new Map<string, { iata: string; icao: string | null; name: string; country: string | null; active: boolean }>();
  for (const l of lines) {
    const [, name, , iata, icao, , country, active] = parseDatLine(l);
    if (!/^[A-Z0-9]{2}$/.test(iata ?? "")) continue;
    const row = { iata, icao: icao || null, name, country: country || null, active: active === "Y" };
    const prev = byIata.get(iata);
    if (!prev || (!prev.active && row.active)) byIata.set(iata, row); // prefer active carriers
  }
  const airlineRows = [...byIata.values()].map(({ active: _a, ...r }) => r);
  await chunked(airlineRows, 500, (c) =>
    db.insert(schema.airlines).values(c).onConflictDoUpdate({
      target: schema.airlines.iata,
      set: { icao: sql`excluded.icao`, name: sql`excluded.name`, country: sql`excluded.country` },
    }),
  );
  console.log(`Airlines: ${airlineRows.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
