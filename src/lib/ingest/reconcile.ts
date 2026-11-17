import type { EmailKind, ExtractedLeg } from "./types";
import { isValidDate, isValidTime } from "@/lib/time";
import { normalizeFlightNumber } from "./types";
import { mergeSeats, parseSeatText, type SeatEntry } from "@/lib/seats";

const normalizeNumber = (raw: string, airline?: string | null) => normalizeFlightNumber(raw, airline)?.full ?? null;

/** The fields of a flight that emails can set. */
export type FlightState = {
  airlineIata: string | null;
  airlineName: string | null;
  flightNumber: string;
  depIata: string;
  arrIata: string;
  depDate: string;
  schedDepLocal: string | null;
  schedArrLocal: string | null;
  seat: string | null;
  seats: SeatEntry[];
  cabin: string | null;
  pnr: string | null;
  passengerName: string | null;
  passengerNames: string[];
  aircraftType: string | null;
  operatingAirlineIata: string | null;
  operatingAirlineName: string | null;
  codeshareNumbers: string[];
  forOthers: boolean;
  cancelled: boolean;
  statusEmailAt: Date | null;
  timesEmailAt: Date | null;
  confidence: number | null;
  userConfirmed: boolean;
};

export type Candidate = {
  leg: ExtractedLeg & { depDate: string }; // flightNumber already normalised, date resolved
  kind: EmailKind;
  emailAt: Date | null;
  confidence: number;
};

export { nameMatches, nameTokens } from "@/lib/names";
import { nameMatches, nameTokens } from "@/lib/names";

/** Adds names not already present (same tokens in any order, titles ignored). */
export function unionNames(existing: string[], incoming: string[]): string[] {
  const key = (n: string) => nameTokens(n).sort().join(" ");
  const seen = new Set(existing.map(key));
  const out = [...existing];
  for (const n of incoming) {
    const k = key(n);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(n.trim());
  }
  return out;
}

const STATUS_RESTORING: EmailKind[] = ["booking", "check_in", "boarding_pass", "change"];
const SEAT_AUTHORITY: EmailKind[] = ["boarding_pass", "check_in"];

function localDateTime(date: string | null, time: string | null): string | null {
  return isValidDate(date) && isValidTime(time) ? `${date}T${time}` : null;
}

/** Merges one extracted leg into an existing flight (or creates the state for a new one). */
export function mergeLeg(existing: FlightState | null, c: Candidate, aliases: string[]): FlightState {
  const { leg, kind } = c;
  const at = c.emailAt ?? new Date(0);
  const s: FlightState = existing
    ? { ...existing }
    : {
        airlineIata: null, airlineName: null, flightNumber: leg.flightNumber, depIata: leg.depIata,
        arrIata: leg.arrIata, depDate: leg.depDate, schedDepLocal: null, schedArrLocal: null, seat: null, seats: [],
        cabin: null, pnr: null, passengerName: null, passengerNames: [], operatingAirlineIata: null,
        operatingAirlineName: null, codeshareNumbers: [], aircraftType: null, forOthers: false, cancelled: false,
        statusEmailAt: null, timesEmailAt: null, confidence: null, userConfirmed: false,
      };

  // Cancellation status: the newest email wins.
  if (kind === "cancellation") {
    if (!s.statusEmailAt || at >= s.statusEmailAt) {
      s.cancelled = true;
      s.statusEmailAt = at;
    }
  } else if (STATUS_RESTORING.includes(kind)) {
    if (!s.statusEmailAt || at > s.statusEmailAt) {
      s.cancelled = false;
      s.statusEmailAt = at;
    }
  }

  s.passengerNames = unionNames(s.passengerNames ?? [], leg.passengers);
  // Seats per passenger: kept for everyone on the booking, even on flights you confirmed by hand.
  const incomingSeats: SeatEntry[] = leg.seats?.length
    ? leg.seats.map((x) => ({ name: x.passenger?.trim() || null, seat: x.seat.toUpperCase().trim() }))
    : parseSeatText(leg.seat, leg.passengers);
  s.seats = mergeSeats(s.seats ?? [], incomingSeats, SEAT_AUTHORITY.includes(kind));

  // Codeshares: remember the other numbers this flight was sold under, and who really flies it.
  const opNumber = leg.operatedBy?.flightNumber ? normalizeNumber(leg.operatedBy.flightNumber, leg.operatedBy.airlineIata) : null;
  s.codeshareNumbers = [...new Set([...(s.codeshareNumbers ?? []), leg.flightNumber, ...(opNumber ? [opNumber] : [])])]
    .filter((n) => n !== s.flightNumber);
  if (leg.operatedBy && (leg.operatedBy.airlineIata || leg.operatedBy.airlineName)) {
    s.operatingAirlineIata ??= leg.operatedBy.airlineIata?.toUpperCase() ?? (opNumber ? opNumber.slice(0, 2) : null);
    s.operatingAirlineName ??= leg.operatedBy.airlineName;
  }

  if (s.userConfirmed) return s; // you edited/confirmed it: only the status may change

  // Times and route: the newest non-cancellation email wins; fill gaps from any email.
  const depLocal = localDateTime(leg.depDate, leg.depTime);
  let arrLocal = localDateTime(leg.arrDate ?? leg.depDate, leg.arrTime);
  if (arrLocal && depLocal && !leg.arrDate && arrLocal < depLocal) {
    const d = new Date(`${leg.depDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    arrLocal = `${d.toISOString().slice(0, 10)}T${leg.arrTime}`;
  }
  const newerTimes = kind !== "cancellation" && (!s.timesEmailAt || at >= s.timesEmailAt);
  if (depLocal && (newerTimes || !s.schedDepLocal)) {
    s.schedDepLocal = depLocal;
    s.schedArrLocal = arrLocal ?? (newerTimes ? null : s.schedArrLocal);
    s.arrIata = leg.arrIata || s.arrIata;
    if (newerTimes) s.timesEmailAt = at;
  } else if (!s.schedArrLocal && arrLocal) {
    s.schedArrLocal = arrLocal;
  }

  s.airlineIata ??= leg.airlineIata?.toUpperCase() ?? null;
  s.airlineName ??= leg.airlineName;
  s.pnr ??= leg.pnr?.toUpperCase() ?? null;
  s.cabin ??= leg.cabin;
  s.aircraftType ??= leg.aircraftType;
  if (leg.seat && (SEAT_AUTHORITY.includes(kind) || !s.seat)) s.seat = leg.seat.toUpperCase();

  // Whose flight is it?
  if (leg.passengers.length && aliases.length) {
    const mine = leg.passengers.find((p) => nameMatches(p, aliases));
    if (mine) {
      s.forOthers = false;
      s.passengerName = mine;
    } else if (!existing || existing.forOthers) {
      s.forOthers = true;
      s.passengerName ??= leg.passengers[0];
    }
  } else if (leg.passengers.length) {
    s.passengerName ??= leg.passengers[0];
  }

  s.confidence = Math.max(s.confidence ?? 0, c.confidence);
  return s;
}

/**
 * Whose flight is it, judged from every passenger name seen on its tickets.
 * No names or no aliases means we cannot tell, so it counts as yours (same as during import).
 */
export function ownership(names: string[], aliases: string[]): { forOthers: boolean; mine: string | null } {
  if (!names.length || !aliases.length) return { forOthers: false, mine: null };
  const mine = names.find((n) => nameMatches(n, aliases)) ?? null;
  return { forOthers: !mine, mine };
}

type TwinFields = Pick<FlightState, "flightNumber" | "depDate" | "depIata" | "arrIata" | "schedDepLocal" | "pnr" | "codeshareNumbers">;

const minutesOf = (local: string | null) => (local && local.length >= 16 ? Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16)) : null);

/**
 * Same physical flight sold under two numbers (codeshare): same date and route, different flight number, and
 * either departure times within 15 minutes or the same booking reference on two different airlines.
 * Same airline + same PNR at different times is a rebooking, not a codeshare, so it is not matched.
 */
export function isCodeshareTwin(a: TwinFields, b: TwinFields): boolean {
  if (a.flightNumber === b.flightNumber) return false;
  if (a.depDate !== b.depDate || a.depIata !== b.depIata || a.arrIata !== b.arrIata) return false;
  if (a.codeshareNumbers?.includes(b.flightNumber) || b.codeshareNumbers?.includes(a.flightNumber)) return true;
  const ta = minutesOf(a.schedDepLocal), tb = minutesOf(b.schedDepLocal);
  if (ta != null && tb != null) return Math.abs(ta - tb) <= 15;
  const differentAirline = a.flightNumber.slice(0, 2) !== b.flightNumber.slice(0, 2);
  return differentAirline && !!a.pnr && a.pnr === b.pnr;
}
