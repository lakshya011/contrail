import { describe, expect, it } from "vitest";
import { needsChecking, oneLetterNeighbours, suggestAirportFix, type AirportInfo } from "@/lib/ingest/airport-fix";

const ap = (iata: string, country: string, scheduled: boolean | null = true): AirportInfo => ({ iata, country, scheduled });
const JAI = ap("JAI", "IN");
const cands = [ap("BLR", "IN"), ap("BHU", "IN"), ap("BLI", "US"), ap("BLQ", "IT")];

describe("airport code correction", () => {
  it("only questions unknown airports or ones without airline service", () => {
    expect(needsChecking(ap("BLU", "US", false))).toBe(true);
    expect(needsChecking(null)).toBe(true);
    expect(needsChecking(ap("BLR", "IN"))).toBe(false);
    expect(needsChecking(ap("XYZ", "IN", null))).toBe(false); // no data: leave it alone
  });

  it("lists every one-letter neighbour", () => {
    const n = oneLetterNeighbours("BLU");
    expect(n).toHaveLength(75);
    expect(n).toContain("BLR");
    expect(n).not.toContain("BLU");
  });

  it("BLU → BLR when another copy of the same flight already says BLR", () => {
    expect(suggestAirportFix("BLU", { other: JAI, candidates: cands, sameFlightCodes: ["BLR", "BLU"] })).toBe("BLR");
  });

  it("BLU → BLR when it is the Indian airport you actually use", () => {
    expect(suggestAirportFix("BLU", { other: JAI, candidates: cands, usage: new Map([["BLR", 120]]) })).toBe("BLR");
  });

  it("does not guess when two airports in the country fit equally", () => {
    expect(suggestAirportFix("BLU", { other: JAI, candidates: cands })).toBeNull();
  });

  it("picks the only served airport in the other end's country", () => {
    expect(suggestAirportFix("BLU", { other: ap("SEA", "US"), candidates: cands })).toBe("BLI");
  });
});
