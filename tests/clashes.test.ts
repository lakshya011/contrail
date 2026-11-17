import { describe, expect, it } from "vitest";
import { findClashes, type ClashFlight } from "@/lib/stats/clashes";

const IST = 5.5 * 3600e3;
const fl = (id: string, num: string, date: string, dep: string, arr: string, depT: string, arrT: string, confirmed = false): ClashFlight => {
  const d = new Date(Date.parse(`${date}T${depT}:00Z`) - IST), a = new Date(Date.parse(`${date}T${arrT}:00Z`) - IST);
  return { id, flightNumber: num, depDate: date, depIata: dep, arrIata: arr, schedDepLocal: `${date}T${depT}`, schedDepUtc: d, schedArrUtc: a, userConfirmed: confirmed };
};

describe("findClashes", () => {
  it("11 Dec 2024: three VNS→BLR flights the same day all clash", () => {
    const c = findClashes([
      fl("a", "IX2716", "2024-12-11", "VNS", "BLR", "09:45", "12:20"),
      fl("b", "IX2743", "2024-12-11", "VNS", "BLR", "13:35", "16:10"),
      fl("c", "6E144", "2024-12-11", "VNS", "BLR", "15:30", "18:05"),
    ]);
    expect(c.get("c")?.withNumbers.sort()).toEqual(["IX2716", "IX2743"]);
    expect(c.get("a")?.reason).toMatch(/left VNS twice/);
  });

  it("12 Nov 2024: two COK→BLR IndiGo flights 2 hours apart", () => {
    const c = findClashes([
      fl("a", "6E702", "2024-11-12", "COK", "BLR", "05:25", "06:35"),
      fl("b", "6E728", "2024-11-12", "COK", "BLR", "07:20", "08:30"),
    ]);
    expect(c.size).toBe(2);
  });

  it("a same-day round trip is fine", () => {
    expect(findClashes([
      fl("a", "6E1", "2025-01-10", "BLR", "JAI", "06:00", "08:40"),
      fl("b", "6E2", "2025-01-10", "JAI", "BLR", "12:00", "14:40"),
      fl("c", "6E3", "2025-01-10", "BLR", "DEL", "18:00", "20:50"),
    ]).size).toBe(0);
  });

  it("a connection is fine; an overlap is not", () => {
    expect(findClashes([
      fl("a", "EY1013", "2026-06-05", "BLR", "AUH", "10:05", "12:35"),
      fl("b", "EY1", "2026-06-05", "AUH", "LHR", "14:00", "18:30"),
    ]).size).toBe(0);
    const c = findClashes([
      fl("a", "AI1", "2025-03-01", "DEL", "BOM", "10:00", "12:10"),
      fl("b", "6E9", "2025-03-01", "BOM", "GOI", "11:30", "12:40"),
    ]);
    expect(c.get("b")?.reason).toMatch(/overlap/);
  });

  it("stays quiet once you have confirmed both flights", () => {
    expect(findClashes([
      fl("a", "6E702", "2024-11-12", "COK", "BLR", "05:25", "06:35", true),
      fl("b", "6E728", "2024-11-12", "COK", "BLR", "07:20", "08:30", true),
    ]).size).toBe(0);
  });
});
