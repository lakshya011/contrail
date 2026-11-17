import type { Extraction, ExtractedLeg, Cabin } from "./types";

type Json = Record<string, unknown>;

function* walk(v: unknown): Generator<Json> {
  if (Array.isArray(v)) for (const x of v) yield* walk(x);
  else if (v && typeof v === "object") {
    yield v as Json;
    for (const x of Object.values(v)) if (x && typeof x === "object") yield* walk(x);
  }
}

const isType = (o: Json, t: string) => {
  const ty = o["@type"];
  return ty === t || (Array.isArray(ty) && ty.includes(t));
};
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Json) : {});

function cabinOf(v: unknown): Cabin | null {
  const s = (str(v) ?? str(obj(v).name) ?? "").toLowerCase();
  if (!s) return null;
  if (s.includes("premium")) return "premium_economy";
  if (s.includes("business") || s.includes("upper")) return "business";
  if (s.includes("first")) return "first";
  return "economy";
}

/**
 * Reads schema.org FlightReservation JSON-LD (the markup Gmail itself uses for flight cards).
 * Returns null when the email has none.
 */
export function extractFromMarkup(html: string): Extraction | null {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const legs: ExtractedLeg[] = [];
  let cancelled = false;
  for (const b of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(b[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim());
    } catch {
      continue;
    }
    for (const o of walk(data)) {
      if (!isType(o, "FlightReservation")) continue;
      const f = obj(o.reservationFor);
      const airline = obj(f.airline);
      const dep = obj(f.departureAirport), arr = obj(f.arrivalAirport);
      const depTime = str(f.departureTime), arrTime = str(f.arrivalTime);
      const flightNumber = str(f.flightNumber);
      const depIata = str(dep.iataCode), arrIata = str(arr.iataCode);
      if (!flightNumber || !depIata || !arrIata || !depTime) continue;
      if (/Cancel/i.test(String(o.reservationStatus ?? ""))) cancelled = true;
      const seatObj = obj(o.airplaneSeat);
      legs.push({
        airlineIata: str(airline.iataCode),
        airlineName: str(airline.name),
        flightNumber,
        depIata: depIata.toUpperCase(),
        arrIata: arrIata.toUpperCase(),
        depDate: depTime.slice(0, 10),
        depTime: depTime.length >= 16 ? depTime.slice(11, 16) : null,
        arrDate: arrTime ? arrTime.slice(0, 10) : null,
        arrTime: arrTime && arrTime.length >= 16 ? arrTime.slice(11, 16) : null,
        pnr: str(o.reservationNumber),
        seat: str(o.airplaneSeat) ?? str(seatObj.seatNumber),
        cabin: cabinOf(o.airplaneSeatClass),
        passengers: [str(obj(o.underName).name)].filter((x): x is string => !!x),
        aircraftType: null,
        seats: (() => {
          const seat = str(o.airplaneSeat) ?? str(seatObj.seatNumber);
          return seat ? [{ passenger: str(obj(o.underName).name), seat }] : [];
        })(),
        operatedBy: (() => {
          const op = obj(f.operatedBy);
          const iata = str(op.iataCode), name = str(op.name);
          return iata || name ? { airlineIata: iata, airlineName: name, flightNumber: null } : null;
        })(),
      });
    }
  }
  if (!legs.length) return null;
  return { emailKind: cancelled ? "cancellation" : "booking", legs, confidence: 0.95 };
}
