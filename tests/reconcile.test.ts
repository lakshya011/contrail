import { describe, expect, it } from "vitest";
import { mergeLeg, nameMatches, ownership, type Candidate } from "@/lib/ingest/reconcile";
import { normalizeFlightNumber, type ExtractedLeg } from "@/lib/ingest/types";
import { derive } from "@/lib/ingest/enrich";
import type { Airport } from "@/db/schema";

const leg = (o: Partial<Omit<ExtractedLeg, "depDate">> & { depDate?: string } = {}): ExtractedLeg & { depDate: string } => ({
  airlineIata: "6E", airlineName: "IndiGo", flightNumber: "6E2131", depIata: "DEL", arrIata: "BOM",
  depDate: "2024-03-12", depTime: "06:30", arrDate: null, arrTime: "08:40", pnr: "abc123", seat: "12F",
  cabin: "economy", passengers: ["KUMAR/RAVI MR"], aircraftType: null, operatedBy: null, ...o,
});
const c = (kind: Candidate["kind"], at: string, o: Partial<Omit<ExtractedLeg, "depDate">> & { depDate?: string } = {}): Candidate =>
  ({ leg: leg(o), kind, emailAt: new Date(at), confidence: 0.9 });
const ALIASES = ["Ravi Kumar"];

describe("mergeLeg", () => {
  it("booking then cancellation gives a cancelled flight", () => {
    const a = mergeLeg(null, c("booking", "2024-02-01"), ALIASES);
    const b = mergeLeg(a, c("cancellation", "2024-02-10"), ALIASES);
    expect(b.cancelled).toBe(true);
    expect(b.schedDepLocal).toBe("2024-03-12T06:30"); // cancellation does not wipe times
  });

  it("a newer booking after a cancellation restores the flight", () => {
    let s = mergeLeg(null, c("booking", "2024-02-01"), ALIASES);
    s = mergeLeg(s, c("cancellation", "2024-02-10"), ALIASES);
    s = mergeLeg(s, c("booking", "2024-02-20"), ALIASES);
    expect(s.cancelled).toBe(false);
  });

  it("an older email arriving late does not undo a cancellation", () => {
    let s = mergeLeg(null, c("cancellation", "2024-02-10"), ALIASES);
    s = mergeLeg(s, c("booking", "2024-02-01"), ALIASES);
    expect(s.cancelled).toBe(true);
  });

  it("schedule change updates times", () => {
    let s = mergeLeg(null, c("booking", "2024-02-01"), ALIASES);
    s = mergeLeg(s, c("change", "2024-02-15", { depTime: "07:10", arrTime: "09:25" }), ALIASES);
    expect(s.schedDepLocal).toBe("2024-03-12T07:10");
    expect(s.schedArrLocal).toBe("2024-03-12T09:25");
  });

  it("boarding pass sets the final seat and keeps one flight", () => {
    let s = mergeLeg(null, c("booking", "2024-02-01", { seat: null }), ALIASES);
    s = mergeLeg(s, c("boarding_pass", "2024-03-11", { seat: "3a" }), ALIASES);
    expect(s.seat).toBe("3A");
    expect(s.pnr).toBe("ABC123");
  });

  it("rolls arrival to the next day for overnight flights", () => {
    const s = mergeLeg(null, c("booking", "2024-02-01", { depTime: "23:30", arrTime: "02:10" }), ALIASES);
    expect(s.schedArrLocal).toBe("2024-03-13T02:10");
  });

  it("marks flights for other passengers", () => {
    const s = mergeLeg(null, c("booking", "2024-02-01", { passengers: ["SHARMA/PRIYA MS"] }), ALIASES);
    expect(s.forOthers).toBe(true);
    const mine = mergeLeg(null, c("booking", "2024-02-01", { passengers: ["SHARMA/PRIYA MS", "KUMAR/RAVI MR"] }), ALIASES);
    expect(mine.forOthers).toBe(false);
    expect(mine.passengerName).toBe("KUMAR/RAVI MR");
  });

  it("does not change details of a confirmed flight, except status", () => {
    const base = { ...mergeLeg(null, c("booking", "2024-02-01"), ALIASES), userConfirmed: true };
    const s = mergeLeg(base, c("change", "2024-02-15", { depTime: "11:00" }), ALIASES);
    expect(s.schedDepLocal).toBe("2024-03-12T06:30");
  });
});

describe("nameMatches", () => {
  it("ignores order, slashes and titles", () => {
    expect(nameMatches("KUMAR/RAVI MR", ["Ravi Kumar"])).toBe(true);
    expect(nameMatches("Mr. Ravi Kumar", ["RAVI KUMAR"])).toBe(true);
    expect(nameMatches("KUMAR/RAVIMR", ["Ravi Kumar"])).toBe(true);
    expect(nameMatches("KUMAR/ANITA MRS", ["Ravi Kumar"])).toBe(false);
  });
});

describe("normalizeFlightNumber", () => {
  it("normalises spacing and leading zeros", () => {
    expect(normalizeFlightNumber("6e 0231")?.full).toBe("6E231");
    expect(normalizeFlightNumber("AI-101")?.full).toBe("AI101");
    expect(normalizeFlightNumber("901", "UA")?.full).toBe("UA901");
    expect(normalizeFlightNumber("hello")).toBeNull();
  });
});

describe("derive", () => {
  const del = { iata: "DEL", icao: "VIDP", name: "Indira Gandhi Intl", city: "Delhi", country: "IN", lat: 28.5665, lon: 77.1031, tz: "Asia/Kolkata" } as Airport;
  const bom = { iata: "BOM", icao: "VABB", name: "Chhatrapati Shivaji Intl", city: "Mumbai", country: "IN", lat: 19.0887, lon: 72.8679, tz: "Asia/Kolkata" } as Airport;
  it("computes distance, duration and UTC times", () => {
    const s = mergeLeg(null, c("booking", "2024-02-01"), ALIASES);
    const d = derive(s, del, bom);
    expect(d.durationMin).toBe(130);
    expect(d.distanceKm).toBeGreaterThan(1100);
    expect(d.schedDepUtc?.toISOString()).toBe("2024-03-12T01:00:00.000Z");
    expect(d.needsReview).toBe(false);
  });
  it("flags unknown airports for review", () => {
    const s = mergeLeg(null, c("booking", "2024-02-01", { arrIata: "XQZ" }), ALIASES);
    const d = derive(s, del, null);
    expect(d.needsReview).toBe(true);
    expect(d.reviewReason).toContain("XQZ");
  });
});

describe("passenger names", () => {
  it("keeps every name printed on the tickets, without duplicates", () => {
    let s = mergeLeg(null, c("booking", "2024-02-01", { passengers: ["KUMAR/RAVI MR", "SHARMA/PRIYA MS"] }), ALIASES);
    s = mergeLeg(s, c("boarding_pass", "2024-03-11", { passengers: ["Ravi Kumar", "Anita Kumar"] }), ALIASES);
    expect(s.passengerNames).toEqual(["KUMAR/RAVI MR", "SHARMA/PRIYA MS", "Anita Kumar"]);
  });
  it("still records names on a confirmed flight", () => {
    const base = { ...mergeLeg(null, c("booking", "2024-02-01"), ALIASES), userConfirmed: true };
    expect(mergeLeg(base, c("check_in", "2024-03-10", { passengers: ["SHARMA/PRIYA MS"] }), ALIASES).passengerNames).toHaveLength(2);
  });
});

describe("ownership (re-sorting after name changes)", () => {
  it("a first-name alias claims first-name-only tickets but not relatives", () => {
    const aliases = ["Ravi Kumar", "Ravi"];
    expect(ownership(["Ravi"], aliases).forOthers).toBe(false);
    expect(ownership(["Mr. Ravi Kumar"], aliases)).toEqual({ forOthers: false, mine: "Mr. Ravi Kumar" });
    expect(ownership(["Ms. Anita Kumar"], aliases).forOthers).toBe(true);
    expect(ownership(["SHARMA/PRIYA MS", "KUMAR/RAVI MR"], aliases).mine).toBe("KUMAR/RAVI MR");
  });
  it("without the first-name alias, a first name alone is someone else's", () => {
    expect(ownership(["Ravi"], ["Ravi Kumar"]).forOthers).toBe(true);
  });
  it("unknown passengers or no aliases count as yours", () => {
    expect(ownership([], ["Ravi Kumar"]).forOthers).toBe(false);
    expect(ownership(["Someone"], []).forOthers).toBe(false);
  });
});
