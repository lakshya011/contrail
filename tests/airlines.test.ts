import { expect, it } from "vitest";
import { canonicalAirlineNames, titleCase } from "@/lib/airlines";

it("picks one name per airline code from your tickets", () => {
  const m = canonicalAirlineNames([
    { code: "G8", name: "GO FIRST", n: 5 }, { code: "G8", name: "Go First", n: 3 },
    { code: "FD", name: "AIR ASIA", n: 2 }, { code: "FD", name: "AirAsia", n: 1 },
    { code: "I5", name: "Air Asia", n: 2 }, { code: "I5", name: "Air India Express", n: 4 },
    { code: "I5", name: "AirAsia India", n: 2 }, { code: "I5", name: "Indonesia Sky", n: 1 },
    { code: "6E", name: "IndiGo", n: 54 }, { code: "XX", name: null, n: 3 },
  ]);
  expect(m.get("G8")).toBe("Go First");   // same airline, prefer normal casing
  expect(m.get("FD")).toBe("AirAsia");
  expect(m.get("I5")).toBe("Air India Express"); // a one-off wrong name loses
  expect(m.get("6E")).toBe("IndiGo");
  expect(m.has("XX")).toBe(false);
});

it("title-cases all-caps names when that is all there is", () => {
  expect(canonicalAirlineNames([{ code: "SG", name: "SPICEJET", n: 2 }]).get("SG")).toBe("Spicejet");
  expect(titleCase("AIR INDIA EXPRESS")).toBe("Air India Express");
});

it("drops company suffixes", async () => {
  const { cleanAirlineName } = await import("@/lib/airlines");
  expect(cleanAirlineName("Virgin Atlantic Airways Limited")).toBe("Virgin Atlantic Airways");
  expect(cleanAirlineName("InterGlobe Aviation Ltd.")).toBe("InterGlobe Aviation");
  expect(cleanAirlineName("IndiGo")).toBe("IndiGo");
});
