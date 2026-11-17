import { describe, expect, it } from "vitest";
import { describeSeats, mergeSeats, mySeat, parseSeatText } from "@/lib/seats";

const ME = ["Ravi Kumar", "Ravi"];

describe("parseSeatText", () => {
  it("keeps every seat and ties names when printed together", () => {
    expect(parseSeatText("RAVI KUMAR 17A, PRIYA SHARMA 17B")).toEqual([
      { name: "RAVI KUMAR", seat: "17A" }, { name: "PRIYA SHARMA", seat: "17B" },
    ]);
    expect(parseSeatText("21A, 21B")).toEqual([{ name: null, seat: "21A" }, { name: null, seat: "21B" }]);
    expect(parseSeatText("25F/24F").map((s) => s.seat)).toEqual(["25F", "24F"]);
    expect(parseSeatText("57F,64B").map((s) => s.seat)).toEqual(["57F", "64B"]);
    expect(parseSeatText("Seat 12A")).toEqual([{ name: null, seat: "12A" }]);
    expect(parseSeatText("Mr Ravi Kumar: 3C")).toEqual([{ name: "Mr Ravi Kumar", seat: "3C" }]);
  });
  it("gives a lone seat to the only passenger", () => {
    expect(parseSeatText("22D", ["MR. RAVI KUMAR"])).toEqual([{ name: "MR. RAVI KUMAR", seat: "22D" }]);
    expect(parseSeatText("22D", ["A B", "C D"])).toEqual([{ name: null, seat: "22D" }]);
  });
});

describe("mergeSeats", () => {
  it("a boarding pass fills in whose seat an unnamed one is, keeping the companion's", () => {
    const booking = parseSeatText("21A, 21B");
    const bp = mergeSeats(booking, [{ name: "KUMAR/RAVI MR", seat: "21A" }], true);
    expect(bp).toEqual([{ name: "KUMAR/RAVI MR", seat: "21A" }, { name: null, seat: "21B" }]);
    expect(mySeat(bp, ME)).toBe("21A");
  });
  it("a boarding pass with a new seat moves you; a booking email does not", () => {
    const s = [{ name: "Ravi Kumar", seat: "22D" }];
    expect(mergeSeats(s, [{ name: "MR RAVI KUMAR", seat: "25D" }], true)[0].seat).toBe("25D");
    expect(mergeSeats(s, [{ name: "MR RAVI KUMAR", seat: "25D" }], false)[0].seat).toBe("22D");
  });
  it("never drops a companion's seat", () => {
    const s = mergeSeats([{ name: "PRIYA SHARMA", seat: "17B" }], [{ name: "RAVI KUMAR", seat: "17A" }], true);
    expect(s.map((x) => x.seat).sort()).toEqual(["17A", "17B"]);
  });
});

describe("mySeat and display", () => {
  it("only counts a seat that is yours", () => {
    expect(mySeat(parseSeatText("RAVI KUMAR 17A, PRIYA SHARMA 17B"), ME)).toBe("17A");
    expect(mySeat(parseSeatText("21A, 21B"), ME)).toBeNull(); // unknown which is yours
    expect(mySeat([], ME, "14C")).toBe("14C"); // older flights with only seat text
  });
  it("describes seats for the flight page", () => {
    expect(describeSeats(parseSeatText("RAVI KUMAR 17A, PRIYA SHARMA 17B"), ME)).toBe("17A (you), 17B Priya Sharma");
  });
});
