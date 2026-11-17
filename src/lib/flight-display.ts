import type { Flight } from "@/db/schema";

type F = Pick<Flight, "flightNumber" | "airlineIata" | "airlineName" | "operatingAirlineIata" | "operatingAirlineName" | "codeshareNumbers">;

const isCodeshare = (f: F) => !!f.operatingAirlineIata && f.operatingAirlineIata !== f.airlineIata;

/** The number to lead with: the operating airline's own number when we know it, else the number booked. */
export function primaryNumber(f: F): string {
  if (isCodeshare(f)) {
    const op = f.codeshareNumbers?.find((n) => n.startsWith(f.operatingAirlineIata!));
    if (op) return op;
  }
  return f.flightNumber;
}

/** The airline that actually flies the plane. */
export function operatingAirline(f: F): { iata: string | null; name: string | null } {
  return isCodeshare(f)
    ? { iata: f.operatingAirlineIata, name: f.operatingAirlineName ?? f.operatingAirlineIata }
    : { iata: f.airlineIata, name: f.airlineName };
}

const otherNumbers = (f: F) => {
  const main = primaryNumber(f);
  return [f.flightNumber, ...(f.codeshareNumbers ?? [])].filter((n, i, a) => n !== main && a.indexOf(n) === i);
};

/** Numbers other airlines sold this same flight under (codeshares). */
export function alsoSoldAs(f: F): string[] {
  const main = primaryNumber(f);
  return otherNumbers(f).filter((n) => n.slice(0, 2) !== main.slice(0, 2));
}

/** Earlier numbers on the same airline: the flight was renumbered or you were moved to it. */
export function changedFrom(f: F): string[] {
  const main = primaryNumber(f);
  return otherNumbers(f).filter((n) => n.slice(0, 2) === main.slice(0, 2));
}

/** "Operated by Virgin Atlantic" when the operating airline is known but its own flight number is not. */
export function operatedByNote(f: F): string | null {
  return isCodeshare(f) && primaryNumber(f) === f.flightNumber ? `operated by ${f.operatingAirlineName ?? f.operatingAirlineIata}` : null;
}
