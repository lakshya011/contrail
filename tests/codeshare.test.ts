import { describe, expect, it } from "vitest";
import { isCodeshareTwin, mergeLeg } from "@/lib/ingest/reconcile";
import type { ExtractedLeg } from "@/lib/ingest/types";
import { alsoSoldAs, operatedByNote, operatingAirline, primaryNumber } from "@/lib/flight-display";

const f = (flightNumber: string, time: string | null, pnr: string | null, o: object = {}) => ({
  flightNumber, depDate: "2026-06-28", depIata: "LHR", arrIata: "DEL",
  schedDepLocal: time ? `2026-06-28T${time}` : null, pnr, codeshareNumbers: [] as string[], ...o,
});

describe("isCodeshareTwin", () => {
  it("DL 5947 and VS 5947: same route, same time, same PNR", () => {
    expect(isCodeshareTwin(f("DL5947", "20:10", "XYZ789"), f("VS5947", "20:10", "XYZ789"))).toBe(true);
  });
  it("EY 1013 sold on Akasa QP 590", () => {
    expect(isCodeshareTwin(f("EY1013", "10:05", "QWE456"), f("QP590", "10:05", "QWE456"))).toBe(true);
  });
  it("arrival times may differ slightly; departure within 15 min still matches", () => {
    expect(isCodeshareTwin(f("DL5960", "23:15", null), f("VS5960", "23:05", null))).toBe(true);
  });
  it("rebooking on the same airline at another time is NOT a codeshare (IX 2716 / IX 2743)", () => {
    expect(isCodeshareTwin(f("IX2716", "09:45", "RTY321"), f("IX2743", "13:35", "RTY321"))).toBe(false);
  });
  it("different flights on the same route and day are kept apart", () => {
    expect(isCodeshareTwin(f("6E144", "15:30", "UIO654"), f("IX2716", "09:45", "RTY321"))).toBe(false);
  });
  it("matches on PNR across airlines when times are missing", () => {
    expect(isCodeshareTwin(f("DL5947", null, "XYZ789"), f("VS5947", null, "XYZ789"))).toBe(true);
    expect(isCodeshareTwin(f("DL5947", null, null), f("VS5947", null, null))).toBe(false);
  });
});

const leg = (o: Partial<Omit<ExtractedLeg, "depDate">> & { depDate?: string }): ExtractedLeg & { depDate: string } => ({
  airlineIata: "DL", airlineName: "Delta Air Lines", flightNumber: "DL5947", depIata: "LHR", arrIata: "DEL", depDate: "2026-06-28",
  depTime: "20:10", arrDate: "2026-06-29", arrTime: "09:10", pnr: "XYZ789", seat: null, cabin: "economy", passengers: [],
  aircraftType: null, operatedBy: null, ...o,
});

describe("merging a codeshare", () => {
  it("records the other number and the operating airline", () => {
    let s = mergeLeg(null, { leg: leg({}), kind: "booking", emailAt: new Date("2026-05-01"), confidence: 0.9 }, []);
    s = mergeLeg(s, {
      leg: leg({ flightNumber: "VS5947", airlineIata: "VS", operatedBy: { airlineIata: "VS", airlineName: "Virgin Atlantic", flightNumber: null } }),
      kind: "check_in", emailAt: new Date("2026-06-27"), confidence: 0.9,
    }, []);
    expect(s.flightNumber).toBe("DL5947");
    expect(s.codeshareNumbers).toEqual(["VS5947"]);
    expect(s.operatingAirlineIata).toBe("VS");
    // Shown as the operating flight
    const view = { ...s, airlineName: "Delta Air Lines" };
    expect(primaryNumber(view)).toBe("VS5947");
    expect(operatingAirline(view)).toEqual({ iata: "VS", name: "Virgin Atlantic" });
    expect(alsoSoldAs(view)).toEqual(["DL5947"]);
    expect(operatedByNote(view)).toBeNull();
  });
  it("says 'operated by' when the operating airline's own number is unknown", () => {
    const s = mergeLeg(null, {
      leg: leg({ operatedBy: { airlineIata: "VS", airlineName: "Virgin Atlantic", flightNumber: null } }),
      kind: "booking", emailAt: new Date("2026-05-01"), confidence: 0.9,
    }, []);
    expect(primaryNumber({ ...s })).toBe("DL5947");
    expect(operatedByNote({ ...s })).toBe("operated by Virgin Atlantic");
  });
});

it("a renumbered flight on the same airline is 'changed from', not a codeshare", async () => {
  const { changedFrom } = await import("@/lib/flight-display");
  const v = { flightNumber: "IX2830", airlineIata: "IX", airlineName: "Air India Express", operatingAirlineIata: null, operatingAirlineName: null, codeshareNumbers: ["IX1259"] };
  expect(alsoSoldAs(v)).toEqual([]);
  expect(changedFrom(v)).toEqual(["IX1259"]);
});
