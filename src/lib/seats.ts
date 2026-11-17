import { nameMatches, nameTokens } from "@/lib/names";

/** One seat on a booking. `name` is the passenger it belongs to, or null when no email has said yet. */
export type SeatEntry = { name: string | null; seat: string };

const SEAT = /\b(\d{1,3}[A-K])\b/gi;
const NOISE = /\b(seats?|seat no\.?|no\.?|adult|child|infant)\b/gi;

/**
 * Reads seat text as printed or as extracted:
 *   "21A, 21B" · "25F/24F" · "RAVI KUMAR 17A, PRIYA SHARMA 17B" · "Mr Ravi Kumar: 3C"
 * A single unnamed seat on a one-passenger booking is given to that passenger.
 */
export function parseSeatText(text: string | null | undefined, passengers: string[] = []): SeatEntry[] {
  if (!text?.trim()) return [];
  const out: SeatEntry[] = [];
  for (const part of text.split(/\s*(?:,|\/|;|&|\band\b|\|)\s*/i)) {
    const seats = [...part.matchAll(SEAT)].map((m) => m[1].toUpperCase());
    if (!seats.length) continue;
    const name = part.replace(SEAT, " ").replace(NOISE, " ").replace(/[:\-–]/g, " ").replace(/\s+/g, " ").trim();
    const hasName = /[a-z]{2,}/i.test(name);
    for (const seat of seats) out.push({ name: hasName && seats.length === 1 ? name : null, seat });
  }
  const unique = dedupe(out);
  if (unique.length === 1 && !unique[0].name && passengers.length === 1) unique[0].name = passengers[0];
  return unique;
}

const samePerson = (a: string, b: string) => nameMatches(a, [b]) || nameMatches(b, [a]);

function dedupe(seats: SeatEntry[]): SeatEntry[] {
  const out: SeatEntry[] = [];
  for (const s of seats) {
    const same = out.find((o) => o.seat === s.seat && (!o.name || !s.name || samePerson(o.name, s.name)));
    if (same) same.name ??= s.name;
    else out.push({ ...s });
  }
  return out;
}

/**
 * Adds seats from a newer email. A seat tied to a passenger replaces that passenger's earlier seat when the
 * email is authoritative (check-in, boarding pass) or when the earlier one was missing. A named seat that matches
 * an unnamed one fills in the name. Nothing is ever dropped otherwise, so companions' seats are kept.
 */
export function mergeSeats(existing: SeatEntry[], incoming: SeatEntry[], authoritative: boolean): SeatEntry[] {
  const out = existing.map((s) => ({ ...s }));
  for (const s of incoming) {
    if (s.name) {
      const mine = out.find((o) => o.name && samePerson(o.name, s.name!));
      if (mine) {
        if (authoritative && mine.seat !== s.seat) {
          // The old seat may still be listed unnamed elsewhere; the person has moved to s.seat.
          mine.seat = s.seat;
        }
        continue;
      }
      const unnamed = out.find((o) => !o.name && o.seat === s.seat);
      if (unnamed) unnamed.name = s.name;
      else out.push({ ...s });
    } else if (!out.some((o) => o.seat === s.seat)) {
      out.push({ ...s });
    }
  }
  return dedupe(out);
}

/** Your seat: the one tied to one of your names, or the only seat on a booking that names nobody else. */
export function mySeat(seats: SeatEntry[], aliases: string[], fallbackText?: string | null): string | null {
  const list = seats.length ? seats : parseSeatText(fallbackText);
  const named = list.find((s) => s.name && aliases.length && nameMatches(s.name, aliases));
  if (named) return named.seat;
  if (list.length === 1 && (!list[0].name || !aliases.length)) return list[0].seat;
  return null;
}

/** "17A (you), 17B Priya Sharma" for the flight page. */
export function describeSeats(seats: SeatEntry[], aliases: string[]): string | null {
  if (!seats.length) return null;
  return seats
    .map((s) => {
      if (!s.name) return s.seat;
      if (aliases.length && nameMatches(s.name, aliases)) return `${s.seat} (you)`;
      return `${s.seat} ${nameTokens(s.name).map((t) => t[0] + t.slice(1).toLowerCase()).join(" ")}`;
    })
    .join(", ");
}
