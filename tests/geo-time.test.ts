import { describe, expect, it } from "vitest";
import { haversineKm } from "@/lib/geo/distance";
import { localToUtc, utcToLocal } from "@/lib/time";

describe("haversineKm", () => {
  it("matches known route distances", () => {
    expect(haversineKm(28.5665, 77.1031, 19.0887, 72.8679)).toBeGreaterThan(1120); // DEL–BOM ≈ 1,140 km
    expect(haversineKm(28.5665, 77.1031, 19.0887, 72.8679)).toBeLessThan(1160);
    const blrSfo = haversineKm(13.1979, 77.7063, 37.6189, -122.375); // ≈ 13,990 km
    expect(blrSfo).toBeGreaterThan(13900);
    expect(blrSfo).toBeLessThan(14100);
  });
});

describe("localToUtc", () => {
  it("converts India time (no DST)", () => {
    expect(localToUtc("2024-03-12T06:30", "Asia/Kolkata")?.toISOString()).toBe("2024-03-12T01:00:00.000Z");
  });
  it("handles US daylight saving", () => {
    expect(localToUtc("2024-07-01T09:00", "America/Los_Angeles")?.toISOString()).toBe("2024-07-01T16:00:00.000Z");
    expect(localToUtc("2024-01-15T09:00", "America/Los_Angeles")?.toISOString()).toBe("2024-01-15T17:00:00.000Z");
  });
  it("round-trips with utcToLocal", () => {
    const d = localToUtc("2023-11-05T23:45", "Europe/London")!;
    expect(utcToLocal(d, "Europe/London")).toBe("2023-11-05T23:45");
  });
});
