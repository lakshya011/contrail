import { describe, expect, it } from "vitest";
import { extractFromMarkup } from "@/lib/ingest/markup";
import { looksLikeFlightEmail } from "@/lib/ingest/prefilter";
import { computePassport, seatPosition } from "@/lib/stats/passport";

const JSONLD = `<html><head><script type="application/ld+json">
{"@context":"http://schema.org","@type":"FlightReservation","reservationNumber":"RXJ34P",
 "reservationStatus":"http://schema.org/ReservationConfirmed","underName":{"@type":"Person","name":"Ravi Kumar"},
 "airplaneSeat":"14C","reservationFor":{"@type":"Flight","flightNumber":"110","airline":{"@type":"Airline","name":"United","iataCode":"UA"},
 "departureAirport":{"@type":"Airport","iataCode":"SFO"},"departureTime":"2017-03-04T20:15:00-08:00",
 "arrivalAirport":{"@type":"Airport","iataCode":"JFK"},"arrivalTime":"2017-03-05T06:30:00-05:00"}}
</script></head><body>Your trip</body></html>`;

describe("extractFromMarkup", () => {
  it("reads schema.org FlightReservation", () => {
    const ex = extractFromMarkup(JSONLD)!;
    expect(ex.emailKind).toBe("booking");
    expect(ex.legs[0]).toMatchObject({ flightNumber: "110", airlineIata: "UA", depIata: "SFO", arrIata: "JFK", depDate: "2017-03-04", depTime: "20:15", arrTime: "06:30", pnr: "RXJ34P", seat: "14C" });
  });
  it("detects cancellations", () => {
    expect(extractFromMarkup(JSONLD.replace("ReservationConfirmed", "ReservationCancelled"))!.emailKind).toBe("cancellation");
  });
  it("returns null without markup", () => {
    expect(extractFromMarkup("<p>hello</p>")).toBeNull();
  });
});

describe("looksLikeFlightEmail", () => {
  it("accepts e-tickets and rejects promos without flight details", () => {
    expect(looksLikeFlightEmail("Your IndiGo itinerary", "PNR: K7LM2Q Flight 6E 2131 Departure DEL 06:30 Arrival BOM 08:40 Terminal 1")).toBe(true);
    expect(looksLikeFlightEmail("Big sale!", "Fly anywhere this summer with fares from Rs 999")).toBe(false);
  });
});

describe("passport", () => {
  it("guesses seat positions", () => {
    expect(seatPosition("12A")).toBe("window");
    expect(seatPosition("12C")).toBe("aisle");
    expect(seatPosition("12B")).toBe("middle");
    expect(seatPosition(null)).toBeNull();
  });
  it("totals add up to the flight list", () => {
    const ap = (iata: string, country: string, lat: number, lon: number) => ({ iata, icao: null, name: iata, city: iata, country, lat, lon, tz: "UTC" });
    const mk = (id: string, date: string, dep: ReturnType<typeof ap>, arr: ReturnType<typeof ap>, km: number) => ({
      id, depDate: date, depIata: dep.iata, arrIata: arr.iata, dep, arr, distanceKm: km, durationMin: 120, flightNumber: "6E1",
      airlineIata: "6E", airlineName: "IndiGo", seat: "1A", cabin: "economy", schedDepLocal: `${date}T08:00`, status: "flown",
    });
    const DEL = ap("DEL", "IN", 28.5, 77.1), BOM = ap("BOM", "IN", 19.1, 72.9), DXB = ap("DXB", "AE", 25.2, 55.4);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flights = [mk("1", "2019-01-01", DEL, BOM, 1140), mk("2", "2019-06-01", BOM, DEL, 1140), mk("3", "2021-02-01", DEL, DXB, 2190)] as any;
    const p = computePassport(flights);
    expect(p.totals).toMatchObject({ flights: 3, distanceKm: 4470, airports: 3, countries: 2, airlines: 1 });
    expect(p.topRoutes[0]).toMatchObject({ key: "BOM-DEL", count: 2 });
    expect(p.habits).toMatchObject({ domestic: 2, international: 1 });
    expect(p.records.longestGap?.days).toBe(611);
    expect(computePassport(flights, "2019").totals.flights).toBe(2);
  });
});
